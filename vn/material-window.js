        // 素材設置功能
        // 全局變數
        let portraitBaseUrlInput, portraitFormatInput, testCharacterInput, testPortraitBtn, portraitTestResult;
        let bgmBaseUrlInput, bgmFormatInput, testBgmInput, testBgmBtn, bgmTestResult;
        let soundEffectBaseUrlInput, soundEffectFormatInput, testSoundEffectInput, testSoundEffectBtn, soundEffectTestResult;
        let characterImgBaseUrlInput, characterImgFormatInput;
        let backgroundBaseUrlInput, backgroundFallbackUrlInput, backgroundFormatInput;
        let areaGifBaseUrlInput, areaGifFormatInput;
        let stickerBaseUrlInput, stickerDefaultUrlInput, stickerFormatInput;
        let itemImgBaseUrlInput, itemImgFormatInput;
        let itemTypeBaseUrlInput, itemTypeFormatInput;
        
        // 全局切換標籤相關變數
        let urlModeBtn, uploadModeBtn;
        let currentSourceMode = 'url'; // 默認為URL模式

        // 載入素材設置函數（全局）
        function loadMaterialSettings() {
            const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
            
            // 載入全局切換模式
    // console.log('[VN面板] loadMaterialSettings - 原始設置:', savedSettings);
    // console.log('[VN面板] loadMaterialSettings - savedSettings.sourceMode:', savedSettings.sourceMode);
    
    currentSourceMode = savedSettings.sourceMode || 'url'; // 默认使用URL模式
    // console.log('[VN面板] loadMaterialSettings - 設置後的 currentSourceMode:', currentSourceMode);
    
    // 如果没有保存过设置，保存默认设置
    if (!savedSettings.sourceMode) {
        savedSettings.sourceMode = currentSourceMode;
        localStorage.setItem('vn_material_settings', JSON.stringify(savedSettings));
        // console.log('[VN面板] loadMaterialSettings - 保存默認設置');
    }
    
                updateSourceModeUI();
    
    // 更新 VNMaterialProcessor 的設置
    if (window.VNMaterialProcessor) {
        window.VNMaterialProcessor.getSourceMode = function() {
            // 先检查内存中的设置
            if (typeof currentSourceMode !== 'undefined') {
                return currentSourceMode;
            }
            
            // 再检查 localStorage
            const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
            const mode = savedSettings.sourceMode || 'url';
            
            // 更新内存中的设置
            if (typeof currentSourceMode !== 'undefined') {
                currentSourceMode = mode;
            }
            
            return mode;
        };
        
        // 添加当前模式属性
        window.VNMaterialProcessor.currentSourceMode = currentSourceMode || 'url';
    }

window.debugMaterialSettings = function() {
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    const currentMode = window.VNMaterialProcessor ? window.VNMaterialProcessor.getSourceMode() : 'unknown';
    
    // console.log('=== 素材設置調試信息 ===');
    // console.log('localStorage 中的設置:', savedSettings);
    // console.log('當前內存中的模式 (currentSourceMode):', typeof currentSourceMode !== 'undefined' ? currentSourceMode : 'undefined');
    // console.log('VNMaterialProcessor.getSourceMode():', currentMode);
    // console.log('VNMaterialProcessor.currentSourceMode:', window.VNMaterialProcessor?.currentSourceMode);
    // console.log('素材圖片管理器:', !!window.materialImageManager);
    
    // 检查UI状态
    const urlModeBtn = document.getElementById('urlModeBtn');
    const uploadModeBtn = document.getElementById('uploadModeBtn');
    // console.log('URL模式按鈕狀態:', urlModeBtn?.classList.contains('active'));
    // console.log('上傳模式按鈕狀態:', uploadModeBtn?.classList.contains('active'));
    
    // 检查模式标签
    const modeBadge = document.getElementById('current-mode-badge');
    // console.log('模式標籤文字:', modeBadge?.textContent);
    
    if (window.materialImageManager) {
        window.materialImageManager.getImagesByCategory('portrait').then(images => {
            // console.log('IndexedDB 中的立繪圖片:', images.length, '張');
            images.forEach(img => {
                // console.log('  -', img.name, '(label:', img.label, ', emotion:', img.emotion, ')');
            });
        });
    }
    
    return {
        localStorage: savedSettings,
        currentMode: currentMode,
        hasManager: !!window.materialImageManager,
        urlBtnActive: urlModeBtn?.classList.contains('active'),
        uploadBtnActive: uploadModeBtn?.classList.contains('active'),
        modeBadgeText: modeBadge?.textContent
    };
};

window.switchToUploadMode = function() {
    // console.log('[調試] 強制切換到上傳模式');
    
    if (typeof switchSourceMode === 'function') {
        switchSourceMode('upload');
    } else {
        // 手动设置
        const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
        savedSettings.sourceMode = 'upload';
        localStorage.setItem('vn_material_settings', JSON.stringify(savedSettings));
        
        if (typeof currentSourceMode !== 'undefined') {
            currentSourceMode = 'upload';
        }
        
        if (window.VNMaterialProcessor) {
            window.VNMaterialProcessor.currentSourceMode = 'upload';
        }
        
        // console.log('[調試] 已手動設置為上傳模式');
    }
    
    // 刷新UI
    if (typeof updateSourceModeUI === 'function') {
        updateSourceModeUI();
    }
    
    return window.debugMaterialSettings();
};
    
    // console.log('[VN面板] 素材設置已載入，當前模式:', currentSourceMode);
    
    // ... 其他设置加载逻辑保持不变
            // 載入立繪設置
            if (savedSettings.portrait?.baseUrl && portraitBaseUrlInput) {
                portraitBaseUrlInput.value = savedSettings.portrait.baseUrl;
            }
            if (savedSettings.portrait?.format && portraitFormatInput) {
                portraitFormatInput.value = savedSettings.portrait.format;
            }
            
            // 載入BGM設置
            if (savedSettings.bgm?.baseUrl && bgmBaseUrlInput) {
                bgmBaseUrlInput.value = savedSettings.bgm.baseUrl;
            }
            if (savedSettings.bgm?.format && bgmFormatInput) {
                bgmFormatInput.value = savedSettings.bgm.format;
            }
            
            // 載入音效設置
            if (savedSettings.soundEffect?.baseUrl && soundEffectBaseUrlInput) {
                soundEffectBaseUrlInput.value = savedSettings.soundEffect.baseUrl;
            }
            if (savedSettings.soundEffect?.format && soundEffectFormatInput) {
                soundEffectFormatInput.value = savedSettings.soundEffect.format;
            }
            
            // 載入角色圖片設置
            if (savedSettings.characterImg?.baseUrl && characterImgBaseUrlInput) {
                characterImgBaseUrlInput.value = savedSettings.characterImg.baseUrl;
            }
            if (savedSettings.characterImg?.format && characterImgFormatInput) {
                characterImgFormatInput.value = savedSettings.characterImg.format;
            }
            
            // 載入背景圖片設置
            if (savedSettings.background?.baseUrl && backgroundBaseUrlInput) {
                backgroundBaseUrlInput.value = savedSettings.background.baseUrl;
            }
            if (savedSettings.background?.fallbackUrl && backgroundFallbackUrlInput) {
                backgroundFallbackUrlInput.value = savedSettings.background.fallbackUrl;
            }
            if (savedSettings.background?.format && backgroundFormatInput) {
                backgroundFormatInput.value = savedSettings.background.format;
            }
            
            // 載入Area GIF設置
            if (savedSettings.areaGif?.baseUrl && areaGifBaseUrlInput) {
                areaGifBaseUrlInput.value = savedSettings.areaGif.baseUrl;
            }
            if (savedSettings.areaGif?.format && areaGifFormatInput) {
                areaGifFormatInput.value = savedSettings.areaGif.format;
            }
            
            // 載入貼圖設置
            if (savedSettings.sticker?.baseUrl && stickerBaseUrlInput) {
                stickerBaseUrlInput.value = savedSettings.sticker.baseUrl;
            }
            if (savedSettings.sticker?.defaultUrl && stickerDefaultUrlInput) {
                stickerDefaultUrlInput.value = savedSettings.sticker.defaultUrl;
            }
            if (savedSettings.sticker?.format && stickerFormatInput) {
                stickerFormatInput.value = savedSettings.sticker.format;
            }
            
            // 載入物品圖片設置
            if (savedSettings.itemImg?.baseUrl && itemImgBaseUrlInput) {
                itemImgBaseUrlInput.value = savedSettings.itemImg.baseUrl;
            }
            if (savedSettings.itemImg?.format && itemImgFormatInput) {
                itemImgFormatInput.value = savedSettings.itemImg.format;
            }
            
            // 載入物品類型設置
            if (savedSettings.itemType?.baseUrl && itemTypeBaseUrlInput) {
                itemTypeBaseUrlInput.value = savedSettings.itemType.baseUrl;
            }
            if (savedSettings.itemType?.format && itemTypeFormatInput) {
                itemTypeFormatInput.value = savedSettings.itemType.format;
            }
        }


        document.addEventListener('DOMContentLoaded', function() {
            // 調試信息
            // console.log('[VN面板] DOMContentLoaded事件觸發');
            const debugTime = document.getElementById('debug-time');
            if (debugTime) {
                debugTime.textContent = new Date().toLocaleString();
            }
            
            // 初始化素材設置元素
            portraitBaseUrlInput = document.getElementById('portrait-base-url');
            portraitFormatInput = document.getElementById('portrait-format');
            testCharacterInput = document.getElementById('test-character-name');
            testPortraitBtn = document.getElementById('test-portrait-btn');
            portraitTestResult = document.getElementById('portrait-test-result');

            bgmBaseUrlInput = document.getElementById('bgm-base-url');
            bgmFormatInput = document.getElementById('bgm-format');
            testBgmInput = document.getElementById('test-bgm-name');
            testBgmBtn = document.getElementById('test-bgm-btn');
            bgmTestResult = document.getElementById('bgm-test-result');

            soundEffectBaseUrlInput = document.getElementById('sound-effect-base-url');
            soundEffectFormatInput = document.getElementById('sound-effect-format');
            testSoundEffectInput = document.getElementById('test-sound-effect-name');
            testSoundEffectBtn = document.getElementById('test-sound-effect-btn');
            soundEffectTestResult = document.getElementById('sound-effect-test-result');

            characterImgBaseUrlInput = document.getElementById('character-img-base-url');
            characterImgFormatInput = document.getElementById('character-img-format');

            backgroundBaseUrlInput = document.getElementById('background-base-url');
            backgroundFallbackUrlInput = document.getElementById('background-fallback-url');
            backgroundFormatInput = document.getElementById('background-format');

            areaGifBaseUrlInput = document.getElementById('area-gif-base-url');
            areaGifFormatInput = document.getElementById('area-gif-format');

            stickerBaseUrlInput = document.getElementById('sticker-base-url');
            stickerDefaultUrlInput = document.getElementById('sticker-default-url');
            stickerFormatInput = document.getElementById('sticker-format');

            itemImgBaseUrlInput = document.getElementById('item-img-base-url');
            itemImgFormatInput = document.getElementById('item-img-format');

            itemTypeBaseUrlInput = document.getElementById('item-type-base-url');
            itemTypeFormatInput = document.getElementById('item-type-format');

            // 新增測試按鈕元素
            testCharacterImgBtn = document.getElementById('test-character-img-btn');
            testCharacterImgNameInput = document.getElementById('test-character-img-name');
            testCharacterImgEmotionInput = document.getElementById('test-character-img-emotion');
            characterImgTestResult = document.getElementById('character-img-test-result');

            testBackgroundBtn = document.getElementById('test-background-btn');
            testBackgroundNameInput = document.getElementById('test-background-name');
            backgroundTestResult = document.getElementById('background-test-result');

            testAreaGifBtn = document.getElementById('test-area-gif-btn');
            testAreaGifNameInput = document.getElementById('test-area-gif-name');
            areaGifTestResult = document.getElementById('area-gif-test-result');

            testStickerBtn = document.getElementById('test-sticker-btn');
            testStickerNameInput = document.getElementById('test-sticker-name');
            stickerTestResult = document.getElementById('sticker-test-result');

            testItemImgBtn = document.getElementById('test-item-img-btn');
            testItemImgNameInput = document.getElementById('test-item-img-name');
            itemImgTestResult = document.getElementById('item-img-test-result');

            testItemTypeBtn = document.getElementById('test-item-type-btn');
            testItemTypeNameInput = document.getElementById('test-item-type-name');
            itemTypeTestResult = document.getElementById('item-type-test-result');

            // 初始化全局切換標籤
            urlModeBtn = document.getElementById('urlModeBtn');
            uploadModeBtn = document.getElementById('uploadModeBtn');
            

// 綁定全局切換標籤事件
if (urlModeBtn && uploadModeBtn) {
    urlModeBtn.addEventListener('click', () => switchSourceMode('url'));
    uploadModeBtn.addEventListener('click', () => switchSourceMode('upload'));
}

            // 初始化時載入素材設置
            if (portraitBaseUrlInput && bgmBaseUrlInput && soundEffectBaseUrlInput) {
                loadMaterialSettings();
                // 更新模式標籤顯示
                updateSourceModeUI();
            }

            // 初始化素材圖片管理器
            initializeMaterialImageManager();
            
            // 等待IndexedDB初始化完成后加载图片
            if (window.materialImageManager) {
                window.materialImageManager.initDB().then(() => {
                    // console.log('[VN面板] IndexedDB初始化完成，开始加载图片');
                    // 初始化圖片上傳功能
                    initializeImageUpload();
                    
                    // 為所有素材類別添加上傳功能
                    setupAllUploadFunctions();
                    
                    // 加载已上传的图片
                    loadUploadedImages();
                }).catch(error => {
                    console.error('[VN面板] IndexedDB初始化失败:', error);
                    // 即使失败也要初始化其他功能
                    initializeImageUpload();
                    setupAllUploadFunctions();
                });
            } else {
                console.warn('[VN面板] materialImageManager未初始化');
                // 初始化圖片上傳功能
                initializeImageUpload();
                
                // 為所有素材類別添加上傳功能
                setupAllUploadFunctions();
            }
            
            // 立即綁定測試按鈕事件
            bindTestButtonEvents();
        });
        
        // 綁定測試按鈕事件的函數
        function bindTestButtonEvents() {
            // console.log('[VN面板] 開始綁定測試按鈕事件');
            
            // 檢查元素是否存在
             console.log('[VN面板] 測試按鈕元素檢查:', {
                testPortraitBtn: !!testPortraitBtn,
                testBgmBtn: !!testBgmBtn,
                testSoundEffectBtn: !!testSoundEffectBtn,
                testCharacterImgBtn: !!testCharacterImgBtn,
                testBackgroundBtn: !!testBackgroundBtn,
                testAreaGifBtn: !!testAreaGifBtn,
                testStickerBtn: !!testStickerBtn,
                testItemImgBtn: !!testItemImgBtn,
                testItemTypeBtn: !!testItemTypeBtn
            });
            
            // 測試立繪按鈕點擊事件
            if (testPortraitBtn) {
                // console.log('[VN面板] 綁定立繪測試按鈕事件');
                testPortraitBtn.addEventListener('click', async function() {
                    // console.log('[VN面板] 立繪測試按鈕被點擊');
                    const characterName = testCharacterInput.value.trim();
                    if (!characterName) {
                        portraitTestResult.innerHTML = '<div class="error">請輸入角色名稱</div>';
                        return;
                    }

                    // 測試圖片是否可載入
                    portraitTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    try {
                        const portraitUrl = await generatePortraitUrl(characterName);
                        if (!portraitUrl) {
                            portraitTestResult.innerHTML = '<div class="error">請設置立繪基礎URL</div>';
                            return;
                        }
                        
                        const testImage = new Image();
                        testImage.onload = function() {
                            portraitTestResult.innerHTML = `
                                <div>
                                    <div class="success">✅ 立繪載入成功</div>
                                    <img src="${portraitUrl}" alt="${characterName}立繪" style="margin-top: 10px;">
                                    <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                        URL: ${portraitUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.onerror = function() {
                            portraitTestResult.innerHTML = `
                                <div class="error">
                                    ❌ 立繪載入失敗<br>
                                    <div style="margin-top: 8px; font-size: 12px;">
                                        請檢查URL是否正確：<br>
                                        ${portraitUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.src = portraitUrl;
                    } catch (error) {
                        console.error('[VN面板] 測試立繪失敗:', error);
                        portraitTestResult.innerHTML = `
                            <div class="error">
                                ❌ 測試失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    錯誤：${error.message}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            // 測試BGM按鈕點擊事件
            if (testBgmBtn) {
                // console.log('[VN面板] 綁定BGM測試按鈕事件');
                testBgmBtn.addEventListener('click', function() {
                    // console.log('[VN面板] BGM測試按鈕被點擊');
                    const bgmName = testBgmInput.value.trim();
                    if (!bgmName) {
                        bgmTestResult.innerHTML = '<div class="error">請輸入BGM名稱</div>';
                        return;
                    }

                    const bgmUrl = generateBgmUrl(bgmName);
                    if (!bgmUrl) {
                        bgmTestResult.innerHTML = '<div class="error">請設置BGM基礎URL</div>';
                        return;
                    }

                    // 測試音頻是否可載入
                    bgmTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    const testAudio = new Audio();
                    testAudio.oncanplaythrough = function() {
                        bgmTestResult.innerHTML = `
                            <div>
                                <div class="success">✅ BGM載入成功</div>
                                <audio controls style="margin-top: 10px; width: 100%;">
                                    <source src="${bgmUrl}" type="audio/mpeg">
                                    您的瀏覽器不支持音頻播放
                                </audio>
                                <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                    URL: ${bgmUrl}
                                </div>
                            </div>
                        `;
                    };
                    
                    testAudio.onerror = function() {
                        bgmTestResult.innerHTML = `
                            <div class="error">
                                ❌ BGM載入失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    請檢查URL是否正確：<br>
                                    ${bgmUrl}
                                </div>
                            </div>
                        `;
                    };
                    
                    testAudio.src = bgmUrl;
                });
            }

            // 測試音效按鈕點擊事件
            if (testSoundEffectBtn) {
                // console.log('[VN面板] 綁定音效測試按鈕事件');
                testSoundEffectBtn.addEventListener('click', function() {
                    // console.log('[VN面板] 音效測試按鈕被點擊');
                    const soundEffectName = testSoundEffectInput.value.trim();
                    if (!soundEffectName) {
                        soundEffectTestResult.innerHTML = '<div class="error">請輸入音效名稱</div>';
                        return;
                    }

                    const soundEffectUrl = generateSoundEffectUrl(soundEffectName);
                    if (!soundEffectUrl) {
                        soundEffectTestResult.innerHTML = '<div class="error">請設置音效基礎URL</div>';
                        return;
                    }

                    // 測試音頻是否可載入
                    soundEffectTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    const testAudio = new Audio();
                    testAudio.oncanplaythrough = function() {
                        soundEffectTestResult.innerHTML = `
                            <div>
                                <div class="success">✅ 音效載入成功</div>
                                <audio controls style="margin-top: 10px; width: 100%;">
                                    <source src="${soundEffectUrl}" type="audio/mpeg">
                                    您的瀏覽器不支持音頻播放
                                </audio>
                                <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                    URL: ${soundEffectUrl}
                                </div>
                            </div>
                        `;
                    };
                    
                    testAudio.onerror = function() {
                        soundEffectTestResult.innerHTML = `
                            <div class="error">
                                ❌ 音效載入失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    請檢查URL是否正確：<br>
                                    ${soundEffectUrl}
                                </div>
                            </div>
                        `;
                    };
                    
                    testAudio.src = soundEffectUrl;
                });
            }

            // 測試角色圖片按鈕點擊事件
            if (testCharacterImgBtn) {
                // console.log('[VN面板] 綁定角色圖片測試按鈕事件');
                testCharacterImgBtn.addEventListener('click', async function() {
                    // console.log('[VN面板] 角色圖片測試按鈕被點擊');
                    const characterName = testCharacterImgNameInput.value.trim();
                    const emotion = testCharacterImgEmotionInput.value.trim();
                    
                    if (!characterName) {
                        characterImgTestResult.innerHTML = '<div class="error">請輸入角色名稱</div>';
                        return;
                    }

                    // 測試圖片是否可載入
                    characterImgTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    try {
                        const characterImgUrl = generateCharacterImgUrl(characterName, emotion);
                        if (!characterImgUrl) {
                            characterImgTestResult.innerHTML = '<div class="error">請設置角色圖片基礎URL</div>';
                            return;
                        }
                        
                        const testImage = new Image();
                        testImage.onload = function() {
                            characterImgTestResult.innerHTML = `
                                <div>
                                    <div class="success">✅ 角色圖片載入成功</div>
                                    <img src="${characterImgUrl}" alt="${characterName}角色圖片" style="margin-top: 10px; max-width: 200px;">
                                    <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                        URL: ${characterImgUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.onerror = function() {
                            characterImgTestResult.innerHTML = `
                                <div class="error">
                                    ❌ 角色圖片載入失敗<br>
                                    <div style="margin-top: 8px; font-size: 12px;">
                                        請檢查URL是否正確：<br>
                                        ${characterImgUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.src = characterImgUrl;
                    } catch (error) {
                        console.error('[VN面板] 測試角色圖片失敗:', error);
                        characterImgTestResult.innerHTML = `
                            <div class="error">
                                ❌ 測試失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    錯誤：${error.message}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            // 測試背景圖片按鈕點擊事件
            if (testBackgroundBtn) {
                // console.log('[VN面板] 綁定背景圖片測試按鈕事件');
                testBackgroundBtn.addEventListener('click', async function() {
                    // console.log('[VN面板] 背景圖片測試按鈕被點擊');
                    const locationName = testBackgroundNameInput.value.trim();
                    
                    if (!locationName) {
                        backgroundTestResult.innerHTML = '<div class="error">請輸入地點名稱</div>';
                        return;
                    }

                    // 測試圖片是否可載入
                    backgroundTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    try {
                        const backgroundUrl = generateBackgroundUrl(locationName);
                        if (!backgroundUrl) {
                            backgroundTestResult.innerHTML = '<div class="error">請設置背景圖片基礎URL</div>';
                            return;
                        }
                        
                        const testImage = new Image();
                        testImage.onload = function() {
                            backgroundTestResult.innerHTML = `
                                <div>
                                    <div class="success">✅ 背景圖片載入成功</div>
                                    <img src="${backgroundUrl}" alt="${locationName}背景圖片" style="margin-top: 10px; max-width: 200px;">
                                    <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                        URL: ${backgroundUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.onerror = function() {
                            backgroundTestResult.innerHTML = `
                                <div class="error">
                                    ❌ 背景圖片載入失敗<br>
                                    <div style="margin-top: 8px; font-size: 12px;">
                                        請檢查URL是否正確：<br>
                                        ${backgroundUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.src = backgroundUrl;
                    } catch (error) {
                        console.error('[VN面板] 測試背景圖片失敗:', error);
                        backgroundTestResult.innerHTML = `
                            <div class="error">
                                ❌ 測試失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    錯誤：${error.message}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            // 測試Area GIF按鈕點擊事件
            if (testAreaGifBtn) {
                // console.log('[VN面板] 綁定Area GIF測試按鈕事件');
                testAreaGifBtn.addEventListener('click', async function() {
                    // console.log('[VN面板] Area GIF測試按鈕被點擊');
                    const areaName = testAreaGifNameInput.value.trim();
                    
                    if (!areaName) {
                        areaGifTestResult.innerHTML = '<div class="error">請輸入區域名稱</div>';
                        return;
                    }

                    // 測試GIF是否可載入
                    areaGifTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    try {
                        const areaGifUrl = generateAreaGifUrl(areaName);
                        if (!areaGifUrl) {
                            areaGifTestResult.innerHTML = '<div class="error">請設置Area GIF基礎URL</div>';
                            return;
                        }
                        
                        const testImage = new Image();
                        testImage.onload = function() {
                            areaGifTestResult.innerHTML = `
                                <div>
                                    <div class="success">✅ Area GIF載入成功</div>
                                    <img src="${areaGifUrl}" alt="${areaName}過場動畫" style="margin-top: 10px; max-width: 200px;">
                                    <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                        URL: ${areaGifUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.onerror = function() {
                            areaGifTestResult.innerHTML = `
                                <div class="error">
                                    ❌ Area GIF載入失敗<br>
                                    <div style="margin-top: 8px; font-size: 12px;">
                                        請檢查URL是否正確：<br>
                                        ${areaGifUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.src = areaGifUrl;
                    } catch (error) {
                        console.error('[VN面板] 測試Area GIF失敗:', error);
                        areaGifTestResult.innerHTML = `
                            <div class="error">
                                ❌ 測試失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    錯誤：${error.message}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            // 測試貼圖按鈕點擊事件
            if (testStickerBtn) {
                // console.log('[VN面板] 綁定貼圖測試按鈕事件');
                testStickerBtn.addEventListener('click', async function() {
                    // console.log('[VN面板] 貼圖測試按鈕被點擊');
                    const stickerName = testStickerNameInput.value.trim();
                    
                    if (!stickerName) {
                        stickerTestResult.innerHTML = '<div class="error">請輸入貼圖名稱</div>';
                        return;
                    }

                    // 測試圖片是否可載入
                    stickerTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    try {
                        const stickerUrl = generateStickerUrl(stickerName);
                        if (!stickerUrl) {
                            stickerTestResult.innerHTML = '<div class="error">請設置貼圖基礎URL</div>';
                            return;
                        }
                        
                        const testImage = new Image();
                        testImage.onload = function() {
                            stickerTestResult.innerHTML = `
                                <div>
                                    <div class="success">✅ 貼圖載入成功</div>
                                    <img src="${stickerUrl}" alt="${stickerName}貼圖" style="margin-top: 10px; max-width: 200px;">
                                    <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                        URL: ${stickerUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.onerror = function() {
                            stickerTestResult.innerHTML = `
                                <div class="error">
                                    ❌ 貼圖載入失敗<br>
                                    <div style="margin-top: 8px; font-size: 12px;">
                                        請檢查URL是否正確：<br>
                                        ${stickerUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.src = stickerUrl;
                    } catch (error) {
                        console.error('[VN面板] 測試貼圖失敗:', error);
                        stickerTestResult.innerHTML = `
                            <div class="error">
                                ❌ 測試失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    錯誤：${error.message}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            // 測試物品圖片按鈕點擊事件
            if (testItemImgBtn) {
                // console.log('[VN面板] 綁定物品圖片測試按鈕事件');
                testItemImgBtn.addEventListener('click', async function() {
                    // console.log('[VN面板] 物品圖片測試按鈕被點擊');
                    const itemName = testItemImgNameInput.value.trim();
                    
                    if (!itemName) {
                        itemImgTestResult.innerHTML = '<div class="error">請輸入物品名稱</div>';
                        return;
                    }

                    // 測試圖片是否可載入
                    itemImgTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    try {
                        const itemImgUrl = generateItemImgUrl(itemName);
                        if (!itemImgUrl) {
                            itemImgTestResult.innerHTML = '<div class="error">請設置物品圖片基礎URL</div>';
                            return;
                        }
                        
                        const testImage = new Image();
                        testImage.onload = function() {
                            itemImgTestResult.innerHTML = `
                                <div>
                                    <div class="success">✅ 物品圖片載入成功</div>
                                    <img src="${itemImgUrl}" alt="${itemName}物品圖片" style="margin-top: 10px; max-width: 200px;">
                                    <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                        URL: ${itemImgUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.onerror = function() {
                            itemImgTestResult.innerHTML = `
                                <div class="error">
                                    ❌ 物品圖片載入失敗<br>
                                    <div style="margin-top: 8px; font-size: 12px;">
                                        請檢查URL是否正確：<br>
                                        ${itemImgUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.src = itemImgUrl;
                    } catch (error) {
                        console.error('[VN面板] 測試物品圖片失敗:', error);
                        itemImgTestResult.innerHTML = `
                            <div class="error">
                                ❌ 測試失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    錯誤：${error.message}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            // 測試物品類型按鈕點擊事件
            if (testItemTypeBtn) {
                // console.log('[VN面板] 綁定物品類型測試按鈕事件');
                testItemTypeBtn.addEventListener('click', async function() {
                    // console.log('[VN面板] 物品類型測試按鈕被點擊');
                    const itemTypeName = testItemTypeNameInput.value.trim();
                    
                    if (!itemTypeName) {
                        itemTypeTestResult.innerHTML = '<div class="error">請輸入物品類型名稱</div>';
                        return;
                    }

                    // 測試圖片是否可載入
                    itemTypeTestResult.innerHTML = '<div class="success">正在測試...</div>';
                    
                    try {
                        const itemTypeUrl = generateItemTypeUrl(itemTypeName);
                        if (!itemTypeUrl) {
                            itemTypeTestResult.innerHTML = '<div class="error">請設置物品類型基礎URL</div>';
                            return;
                        }
                        
                        const testImage = new Image();
                        testImage.onload = function() {
                            itemTypeTestResult.innerHTML = `
                                <div>
                                    <div class="success">✅ 物品類型圖片載入成功</div>
                                    <img src="${itemTypeUrl}" alt="${itemTypeName}類型圖片" style="margin-top: 10px; max-width: 200px;">
                                    <div style="margin-top: 8px; font-size: 12px; color: var(--text-color-light);">
                                        URL: ${itemTypeUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.onerror = function() {
                            itemTypeTestResult.innerHTML = `
                                <div class="error">
                                    ❌ 物品類型圖片載入失敗<br>
                                    <div style="margin-top: 8px; font-size: 12px;">
                                        請檢查URL是否正確：<br>
                                        ${itemTypeUrl}
                                    </div>
                                </div>
                            `;
                        };
                        
                        testImage.src = itemTypeUrl;
                    } catch (error) {
                        console.error('[VN面板] 測試物品類型失敗:', error);
                        itemTypeTestResult.innerHTML = `
                            <div class="error">
                                ❌ 測試失敗<br>
                                <div style="margin-top: 8px; font-size: 12px;">
                                    錯誤：${error.message}
                                </div>
                            </div>
                        `;
                    }
                });
            }
            
            // console.log('[VN面板] 測試按鈕事件綁定完成');
        }
        

// 全局切換標籤功能
function switchSourceMode(mode) {
    // 將 url-single 模式自動轉換為 upload 模式
    if (mode === 'url-single') {
        mode = 'upload';
    }
    
    if (currentSourceMode === mode) return;
    
    currentSourceMode = mode;
    updateSourceModeUI();
    
    // 立即保存設置到 localStorage
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    savedSettings.sourceMode = mode;
    localStorage.setItem('vn_material_settings', JSON.stringify(savedSettings));
    
    let modeText = '';
    if (mode === 'url') modeText = 'URL資料夾';
    else if (mode === 'upload') modeText = '上傳素材';
    
    // console.log(`[素材設置] 切換到${modeText}模式，已自動保存`);
    
    // 立即更新 VNMaterialProcessor 的設置
    if (window.VNMaterialProcessor) {
        window.VNMaterialProcessor.currentSourceMode = mode;
    }
    
    // 顯示設置已保存的提示
    const modeBadge = document.getElementById('current-mode-badge');
    if (modeBadge) {
        const originalText = modeBadge.textContent;
        modeBadge.textContent = `✓ ${modeText}模式已保存`;
        modeBadge.style.background = '#28a745';
        
        setTimeout(() => {
            modeBadge.textContent = originalText;
            if (mode === 'url') {
                modeBadge.style.background = '#007bff';
            } else if (mode === 'upload') {
                modeBadge.style.background = '#28a745';
            }
        }, 2000);
    }
}

// 更新全局切換標籤UI
function updateSourceModeUI() {
    // console.log('[VN面板] updateSourceModeUI 被調用，當前模式:', currentSourceMode);
    
    if (!urlModeBtn || !uploadModeBtn) {
        console.warn('[VN面板] 按鈕元素未找到，跳過UI更新');
        return;
    }
    
    // 更新按鈕狀態
    urlModeBtn.classList.toggle('active', currentSourceMode === 'url');
    uploadModeBtn.classList.toggle('active', currentSourceMode === 'upload' || currentSourceMode === 'url-single');
    
     console.log('[VN面板] 按鈕狀態已更新:', {
        urlActive: urlModeBtn.classList.contains('active'),
        uploadActive: uploadModeBtn.classList.contains('active')
    });
    
    // 更新設置區域顯示
    const urlSettings = document.querySelectorAll('.url-mode-settings');
    const uploadSettings = document.querySelectorAll('.upload-mode-settings');
    const urlSingleSettings = document.querySelectorAll('.url-single-mode-settings');
    
    urlSettings.forEach(el => {
        el.style.display = currentSourceMode === 'url' ? 'block' : 'none';
    });
    
    // 上傳素材模式同時顯示上傳和URL單張設置
    uploadSettings.forEach(el => {
        el.style.display = (currentSourceMode === 'upload' || currentSourceMode === 'url-single') ? 'block' : 'none';
    });
    
    urlSingleSettings.forEach(el => {
        el.style.display = (currentSourceMode === 'upload' || currentSourceMode === 'url-single') ? 'block' : 'none';
    });
    
    // 更新模式標籤
    const modeBadge = document.getElementById('current-mode-badge');
    if (modeBadge) {
        if (currentSourceMode === 'url') {
            modeBadge.textContent = '🌐 URL資料夾模式';
            modeBadge.style.background = '#007bff';
        } else if (currentSourceMode === 'upload' || currentSourceMode === 'url-single') {
            modeBadge.textContent = '📤 上傳素材模式';
            modeBadge.style.background = '#28a745';
        }
    }
}
        
        // 初始化素材圖片管理器
        function initializeMaterialImageManager() {
            if (!window.materialImageManager) {
                // 修复后的素材图片管理器
                window.materialImageManager = {
                    // 使用 IndexedDB 進行持久化存儲
                    dbName: 'VNMaterialDB',
                    dbVersion: 5, // 增加版本号确保数据库正确初始化
                    storeName: 'images',
                    db: null,
                    isInitialized: false,
                    
                    // 初始化 IndexedDB
                    async initDB() {
                        return new Promise((resolve, reject) => {
                            if (this.db && this.isInitialized) {
                                resolve(this.db);
                                return;
                            }
                            
                            // console.log('[素材圖片管理器] 开始初始化IndexedDB...');
                            
                                                // 直接尝试打开数据库，不删除现有数据
                    // console.log('[素材圖片管理器] 尝试打开现有数据库...');
                    this.createNewDB(resolve, reject);
                        });
                    },
                    
                    // 创建新数据库
                    createNewDB(resolve, reject) {
                        const request = indexedDB.open(this.dbName, this.dbVersion);
                        
                        request.onerror = () => {
                            console.error('[素材圖片管理器] IndexedDB 打開失敗:', request.error);
                            reject(request.error);
                        };
                        
                        request.onsuccess = () => {
                            this.db = request.result;
                            this.isInitialized = true;
                            // console.log('[素材圖片管理器] IndexedDB 初始化成功');
                            
                            // 添加数据库连接关闭事件监听
                            this.db.onclose = () => {
                                console.warn('[素材圖片管理器] IndexedDB连接已关闭');
                                this.isInitialized = false;
                            };
                            
                            resolve(this.db);
                        };
                        
                        request.onupgradeneeded = (event) => {
                            const db = event.target.result;
                            
                            // 只在对象存储不存在时创建新的
                            if (!db.objectStoreNames.contains(this.storeName)) {
                                // 创建新的对象存储，使用 id 作为主键
                                const store = db.createObjectStore(this.storeName, { 
                                    keyPath: 'id', 
                                    autoIncrement: true 
                                });
                                
                                store.createIndex('category', 'category', { unique: false });
                                store.createIndex('name', 'name', { unique: false });
                                store.createIndex('label', 'label', { unique: false });
                                store.createIndex('type', 'type', { unique: false });
                                
                                // console.log('[素材圖片管理器] 創建新對象存儲:', this.storeName);
                            } else {
                                // console.log('[素材圖片管理器] 對象存儲已存在，跳過創建');
                            }
                        };
                    },
                        
                    // 上傳圖片 - 使用 Base64 存儲，但確保完整性
                    async uploadImage(file, category) {
                        try {
                            await this.initDB();
                            
                            return new Promise(async (resolve, reject) => {
                                try {
                                    // 压缩图片
                                    const compressedFile = await this.compressImage(file);
                                    
                                    // 转换为 Base64，但使用更可靠的方法
                                    const reader = new FileReader();
                                    reader.onload = async (e) => {
                                        try {
                                            const base64Data = e.target.result;
                                            
                                            // 验证 Base64 数据完整性
                                            if (!base64Data || base64Data.length < 100) {
                                                throw new Error('Base64 數據不完整');
                                            }
                                            
                                            const imageData = {
                                                // id 会由 autoIncrement 自动生成，不需要手动设置
                                                name: file.name,
                                                originalName: file.name,
                                                size: compressedFile.size,
                                                type: compressedFile.type,
                                                category: category || 'portrait',
                                                label: '',
                                                emotion: '',
                                                url: base64Data, // 使用 Base64 数据
                                                timestamp: Date.now()
                                            };
                                            
                                            // console.log(`[素材圖片管理器] 準備保存圖片: ${file.name}, 格式: ${compressedFile.type}, Base64長度: ${base64Data.length}`);
                                            
                                            const transaction = this.db.transaction([this.storeName], 'readwrite');
                                            const store = transaction.objectStore(this.storeName);
                                            
                                            // 等待事务完成
                                            transaction.oncomplete = () => {
                                                const result = { ...imageData, id: imageData.id };
                                                // console.log(`[素材圖片管理器] 上傳壓縮圖片到IndexedDB成功: ${file.name} (${category}), 原始大小: ${(file.size / 1024).toFixed(1)}KB, 壓縮後: ${(compressedFile.size / 1024).toFixed(1)}KB, 格式: ${compressedFile.type}, Base64長度: ${base64Data.length}`);
                                                resolve(result);
                                            };
                                            
                                            transaction.onerror = () => {
                                                console.error('[素材圖片管理器] 事务失败:', transaction.error);
                                                reject(transaction.error);
                                            };
                                            
                                            const request = store.add(imageData);
                                            
                                            request.onsuccess = () => {
                                                imageData.id = request.result;
                                            };
                                            
                                            request.onerror = () => {
                                                console.error('[素材圖片管理器] 保存圖片失敗:', request.error);
                                                reject(request.error);
                                            };
                                        } catch (error) {
                                            reject(error);
                                        }
                                    };
                                    
                                    reader.onerror = () => {
                                        reject(new Error('讀取文件失敗'));
                                    };
                                    
                                    reader.readAsDataURL(compressedFile);
                                } catch (error) {
                                    reject(error);
                                }
                            });
                        } catch (error) {
                            console.error('[素材圖片管理器] 上傳圖片失敗:', error);
                            throw error;
                        }
                    },

                    // 上傳帶標籤的圖片 - 支持文件和URL
                    async uploadImageWithTag(imageData) {
                        try {
                            await this.initDB();
                            
                            return new Promise(async (resolve, reject) => {
                                try {
                                    // 檢查是否為URL類型圖片
                                    if (imageData.type === 'url' && imageData.url) {
                                        // 處理URL類型圖片
                                        const enhancedImageData = {
                                            name: imageData.name || `URL圖片_${Date.now()}`,
                                            originalName: imageData.name || `URL圖片_${Date.now()}`,
                                            size: 0, // URL圖片沒有文件大小
                                            type: 'url',
                                            category: imageData.category || 'portrait',
                                            label: imageData.tag || '',
                                            emotion: imageData.emotion || '',
                                            url: imageData.url, // 直接使用URL
                                            timestamp: imageData.timestamp || Date.now()
                                        };
                                        
                                        // console.log('[素材圖片管理器] 准备保存URL图片数据:', enhancedImageData);
                                        
                                        const transaction = this.db.transaction([this.storeName], 'readwrite');
                                        const store = transaction.objectStore(this.storeName);
                                        
                                        // 等待事务完成
                                        transaction.oncomplete = () => {
                                            const result = { ...enhancedImageData, id: enhancedImageData.id };
                                            // console.log(`[素材圖片管理器] 上傳URL圖片到IndexedDB成功: ${enhancedImageData.name} (${imageData.category}), ID: ${enhancedImageData.id}`);
                                            resolve(result);
                                        };
                                        
                                        transaction.onerror = () => {
                                            console.error('[素材圖片管理器] 事务失败:', transaction.error);
                                            reject(transaction.error);
                                        };
                                        
                                        const request = store.add(enhancedImageData);
                                        
                                        request.onsuccess = () => {
                                            enhancedImageData.id = request.result;
                                        };
                                        
                                        request.onerror = () => {
                                            console.error('[素材圖片管理器] 保存URL圖片失敗:', request.error);
                                            reject(new Error(`保存失败: ${request.error?.message || 'Unknown error'}`));
                                        };
                                        
                                    } else {
                                        // 處理文件類型圖片
                                        const compressedFile = await this.compressImage(imageData.file);
                                        
                                        // 转换为 Base64，但使用更可靠的方法
                                        const reader = new FileReader();
                                        reader.onload = async (e) => {
                                            try {
                                                const base64Data = e.target.result;
                                                
                                                // 验证 Base64 数据完整性
                                                if (!base64Data || base64Data.length < 100) {
                                                    throw new Error('Base64 數據不完整');
                                                }
                                                
                                                const enhancedImageData = {
                                                    // id 会由 autoIncrement 自动生成
                                                    name: imageData.fileName || imageData.file.name,
                                                    originalName: imageData.file.name,
                                                    size: compressedFile.size,
                                                    type: compressedFile.type,
                                                    category: imageData.category || 'portrait',
                                                    label: imageData.label || '',
                                                    emotion: imageData.emotion || '',
                                                    url: base64Data, // 使用 Base64 数据
                                                    timestamp: imageData.timestamp || Date.now()
                                                };
                                                
                                                // console.log('[素材圖片管理器] 准备保存压缩后的带标签图片数据:', enhancedImageData);
                                                // console.log(`[素材圖片管理器] 原始大小: ${(imageData.file.size / 1024).toFixed(1)}KB, 壓縮後: ${(compressedFile.size / 1024).toFixed(1)}KB, 格式: ${compressedFile.type}, Base64長度: ${base64Data.length}`);
                                                
                                                const transaction = this.db.transaction([this.storeName], 'readwrite');
                                                const store = transaction.objectStore(this.storeName);
                                                
                                                // 等待事务完成
                                                transaction.oncomplete = () => {
                                                    const result = { ...enhancedImageData, id: enhancedImageData.id };
                                                    // console.log(`[素材圖片管理器] 上傳壓縮帶標籤圖片到IndexedDB成功: ${enhancedImageData.name} (${imageData.category}), ID: ${enhancedImageData.id}`);
                                                    resolve(result);
                                                };
                                                
                                                transaction.onerror = () => {
                                                    console.error('[素材圖片管理器] 事务失败:', transaction.error);
                                                    reject(transaction.error);
                                                };
                                                
                                                const request = store.add(enhancedImageData);
                                                
                                                request.onsuccess = () => {
                                                    enhancedImageData.id = request.result;
                                                };
                                                
                                                request.onerror = () => {
                                                    console.error('[素材圖片管理器] 保存帶標籤圖片失敗:', request.error);
                                                    reject(new Error(`保存失败: ${request.error?.message || 'Unknown error'}`));
                                                };
                                            } catch (error) {
                                                console.error('[素材圖片管理器] 处理图片数据失败:', error);
                                                reject(error);
                                            }
                                        };
                                        
                                        reader.onerror = () => {
                                            console.error('[素材圖片管理器] 读取文件失败');
                                            reject(new Error('讀取文件失敗'));
                                        };
                                        
                                        reader.readAsDataURL(compressedFile);
                                    }
                                } catch (error) {
                                    console.error('[素材圖片管理器] 压缩图片失败:', error);
                                    reject(error);
                                }
                            });
                        } catch (error) {
                            console.error('[素材圖片管理器] 上傳帶標籤圖片失敗:', error);
                            throw error;
                        }
                    },
                    
                    // 獲取分類圖片 - 支持 Blob 和 URL 格式
                    async getImagesByCategory(category, mode = null) {
                        try {
                            await this.initDB();
                            
                            return new Promise((resolve, reject) => {
                                const transaction = this.db.transaction([this.storeName], 'readonly');
                                const store = transaction.objectStore(this.storeName);
                                const index = store.index('category');
                                const request = index.getAll(category);
                                
                                request.onsuccess = () => {
                                    // 因为使用了 keyPath: 'id'，所以 id 已经包含在对象中
                                    let images = request.result.sort((a, b) => b.timestamp - a.timestamp);
                                    
                                    // 根據模式過濾圖片
                                    if (mode === 'upload') {
                                        // 上傳模式：只返回Base64格式的圖片
                                        images = images.filter(img => img.type !== 'url');
                                    } else if (mode === 'url-single') {
                                        // URL單張模式：只返回URL格式的圖片
                                        images = images.filter(img => img.type === 'url');
                                    }
                                    // 如果不指定模式，返回所有圖片
                                    
                                    // console.log(`[素材圖片管理器] 從IndexedDB獲取 ${category} 分類圖片 (模式: ${mode || 'all'}): ${images.length} 張`);
                                    
                                    // 处理图片数据，验证 Base64 格式
                                    const processedImages = images.map((img, index) => {
                                        let processedImg = { ...img };
                                        
                                        if (img.url) {
                                            // 检查图片类型
                                            if (img.type === 'url') {
                                                // URL类型图片
                                                if (img.url.startsWith('http://') || img.url.startsWith('https://')) {
                                                    // console.log(`[素材圖片管理器] 圖片 ${index + 1}: ${img.name}, URL類型: ${img.url.substring(0, 50)}...`);
                                                } else {
                                                    console.warn(`[素材圖片管理器] 圖片 ${index + 1}: ${img.name}, URL格式不正確: ${img.url.substring(0, 50)}...`);
                                                }
                                            } else {
                                                // Base64类型图片
                                                if (img.url.startsWith('data:image/')) {
                                                    // console.log(`[素材圖片管理器] 圖片 ${index + 1}: ${img.name}, Base64長度: ${img.url.length}, 格式: ${img.type}`);
                                                    
                                                    // 验证数据长度
                                                    if (img.url.length < 100) {
                                                        console.error(`[素材圖片管理器] 圖片 ${index + 1}: ${img.name}, Base64數據過短，可能損壞`);
                                                    }
                                                    
                                                    // 检查环境
                                                    if (window.location.protocol === 'file:') {
                                                        console.warn(`[素材圖片管理器] 警告: 當前在 file:// 協議下運行，可能影響圖片加載`);
                                                    }
                                                    
                                                    if (window.location.href.includes('sandbox')) {
                                                        console.warn(`[素材圖片管理器] 警告: 當前在 sandbox 環境下運行，可能影響圖片加載`);
                                                    }
                                                } else {
                                                    console.warn(`[素材圖片管理器] 圖片 ${index + 1}: ${img.name}, Base64格式不正確: ${img.url.substring(0, 50)}...`);
                                                }
                                            }
                                        } else {
                                            console.warn(`[素材圖片管理器] 圖片 ${index + 1}: ${img.name}, 無有效數據`);
                                        }
                                        
                                        return processedImg;
                                    });
                                    
                                    resolve(processedImages);
                                };
                                
                                request.onerror = () => {
                                    console.error('[素材圖片管理器] 獲取圖片失敗:', request.error);
                                    reject(request.error);
                                };
                            });
                        } catch (error) {
                            console.error('[素材圖片管理器] 獲取分類圖片失敗:', error);
                            return [];
                        }
                    },
                    
                    // 刪除圖片
                    async deleteImage(id) {
                        try {
                            await this.initDB();
                            
                            return new Promise((resolve, reject) => {
                                const transaction = this.db.transaction([this.storeName], 'readwrite');
                                const store = transaction.objectStore(this.storeName);
                                const request = store.delete(id);
                                
                                request.onsuccess = () => {
                                    // console.log(`[素材圖片管理器] 從IndexedDB刪除圖片 ID: ${id}`);
                                    resolve(true);
                                };
                                
                                request.onerror = () => {
                                    console.error('[素材圖片管理器] 刪除圖片失敗:', request.error);
                                    reject(request.error);
                                };
                            });
                        } catch (error) {
                            console.error('[素材圖片管理器] 刪除圖片失敗:', error);
                            return false;
                        }
                    },
                    
                    // 根據標籤查找圖片
                    async findImageByTag(category, label, emotion = '') {
                        try {
                            await this.initDB();
                            
                            return new Promise((resolve, reject) => {
                                const transaction = this.db.transaction([this.storeName], 'readonly');
                                const store = transaction.objectStore(this.storeName);
                                const index = store.index('category');
                                const request = index.getAll(category);
                                
                                request.onsuccess = () => {
                                    const categoryImages = request.result.filter(img => 
                                        img.label === label && 
                                        (emotion === '' || img.emotion === emotion)
                                    );
                                    
                                    // 返回最新的匹配图片
                                    const matchedImage = categoryImages.sort((a, b) => b.timestamp - a.timestamp)[0] || null;
                                    resolve(matchedImage);
                                };
                                
                                request.onerror = () => {
                                    console.error('[素材圖片管理器] 查找圖片失敗:', request.error);
                                    reject(request.error);
                                };
                            });
                        } catch (error) {
                            console.error('[素材圖片管理器] 根據標籤查找圖片失敗:', error);
                            return null;
                        }
                    },
                    
                    // 釋放Blob URL（簡單實現）
                    releaseBlobURL(url) {
                        // 在實際應用中，這裡應該釋放Blob URL
                        // console.log(`[素材圖片管理器] 釋放URL: ${url}`);
                    },

                    // 圖片壓縮方法 - 修復格式匹配問題
                    async compressImage(file, maxWidth = 800, maxHeight = 600, quality = 0.8) {
                        return new Promise((resolve, reject) => {
                            // console.log(`[素材圖片管理器] 開始壓縮圖片: ${(file.size / 1024).toFixed(1)}KB, 原始格式: ${file.type}`);
                            
                            // 根据文件名确定输出格式，确保一致性
                            const fileName = file.name.toLowerCase();
                            let outputFormat = 'image/png'; // 默认使用 PNG 以保持透明
                            
                            // 只有明确是 JPG 文件才使用 JPEG 格式
                            if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
                                outputFormat = 'image/jpeg';
                            }
                            // PNG 和其他格式都使用 PNG 以保持透明
                            
                            // 根据文件大小和格式调整压缩参数
                            let finalQuality = quality;
                            let finalMaxWidth = maxWidth;
                            let finalMaxHeight = maxHeight;
                            
                            // 检查是否为 PNG 文件
                            const isPNG = fileName.endsWith('.png') || file.type === 'image/png';
                            
                            if (file.size > 2 * 1024 * 1024) { // 超过2MB
                                finalQuality = isPNG ? 0.8 : 0.5; // PNG 使用更高质量
                                finalMaxWidth = 600;
                                finalMaxHeight = 450;
                            } else if (file.size > 1024 * 1024) { // 超过1MB
                                finalQuality = isPNG ? 0.8 : 0.6; // PNG 使用更高质量
                                finalMaxWidth = 700;
                                finalMaxHeight = 525;
                            } else if (file.size > 500 * 1024) { // 超过500KB
                                finalQuality = isPNG ? 0.8 : 0.7; // PNG 使用更高质量
                                finalMaxWidth = 750;
                                finalMaxHeight = 562;
                            } else {
                                // 小文件使用更高质量
                                finalQuality = isPNG ? 0.9 : 0.8;
                            }
                            
                            // console.log(`[素材圖片管理器] 使用壓縮參數: ${finalMaxWidth}x${finalMaxHeight}, 質量: ${finalQuality}, 輸出格式: ${outputFormat} (基於文件名: ${file.name})`);
                            
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const img = new Image();
                            
                            img.onload = function() {
                                try {
                                    // 计算压缩后的尺寸
                                    let { width, height } = this.calculateCompressedSize(img.width, img.height, finalMaxWidth, finalMaxHeight);
                                    
                                    canvas.width = width;
                                    canvas.height = height;
                                    
                                    // 绘制压缩后的图片 - 保持透明背景
                                    ctx.clearRect(0, 0, width, height); // 清除为透明
                                    ctx.drawImage(img, 0, 0, width, height);
                                    
                                    // 转换为Blob，保持原始格式
                                    canvas.toBlob((blob) => {
                                        if (blob) {
                                            // console.log(`[素材圖片管理器] 壓縮完成: ${img.width}x${img.height} -> ${width}x${height}, ${(file.size / 1024).toFixed(1)}KB -> ${(blob.size / 1024).toFixed(1)}KB`);
                                            // console.log(`[素材圖片管理器] Blob詳情: 大小 ${blob.size}, 類型 ${blob.type}, 輸出格式 ${outputFormat}`);
                                            
                                            // 创建新的文件对象，保持原始格式
                                            const compressedFile = new File([blob], file.name, {
                                                type: outputFormat,
                                                lastModified: Date.now()
                                            });
                                            
                                            // console.log(`[素材圖片管理器] 壓縮文件詳情: 大小 ${compressedFile.size}, 類型 ${compressedFile.type}, 名稱 ${compressedFile.name}`);
                                            
                                            resolve(compressedFile);
                                        } else {
                                            console.error('[素材圖片管理器] 壓縮失敗，返回原文件');
                                            resolve(file); // 压缩失败时返回原文件
                                        }
                                    }, outputFormat, finalQuality);
                                    
                                } catch (error) {
                                    console.error('[素材圖片管理器] 壓縮過程出錯:', error);
                                    resolve(file); // 出错时返回原文件
                                }
                            }.bind(this);
                            
                            img.onerror = () => {
                                console.error('[素材圖片管理器] 圖片加載失敗，返回原文件');
                                resolve(file); // 加载失败时返回原文件
                            };
                            
                            // 创建图片URL
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                img.src = e.target.result;
                            };
                            reader.onerror = () => {
                                console.error('[素材圖片管理器] 文件讀取失敗，返回原文件');
                                resolve(file); // 读取失败时返回原文件
                            };
                            reader.readAsDataURL(file);
                        });
                    },

                    // 计算压缩尺寸
                    calculateCompressedSize(originalWidth, originalHeight, maxWidth, maxHeight) {
                        let width = originalWidth;
                        let height = originalHeight;
                        
                        // 如果图片过大，按比例缩放
                        if (width > maxWidth || height > maxHeight) {
                            const widthRatio = maxWidth / width;
                            const heightRatio = maxHeight / height;
                            const ratio = Math.min(widthRatio, heightRatio);
                            
                            width = Math.floor(width * ratio);
                            height = Math.floor(height * ratio);
                        }
                        
                        return { width, height };
                    }
                };  
                // console.log('[素材圖片管理器] 已初始化');
                
                // 初始化数据库并预加载图片
                window.materialImageManager.initDB().then(() => {
                    // console.log('[素材圖片管理器] IndexedDB 初始化完成');
                }).catch(error => {
                    console.error('[素材圖片管理器] IndexedDB 初始化失敗:', error);
                });
            }
        }


        // 為所有素材類別設置上傳功能
        function setupAllUploadFunctions() {
            // 防止重复初始化
            if (window.uploadFunctionsInitialized) {
                // console.log('[VN面板] 上传功能已经初始化过，跳过重复初始化');
                return;
            }
            window.uploadFunctionsInitialized = true;
            // 預設圖片上傳
            const portraitUploadBtn = document.getElementById('portrait-upload-btn');
            const portraitFileInput = document.getElementById('portrait-file-input');
            const portraitUploadArea = document.getElementById('portrait-upload-area');
            
            if (portraitUploadBtn && portraitFileInput) {
                portraitUploadBtn.addEventListener('click', () => portraitFileInput.click());
                portraitFileInput.addEventListener('change', (e) => handleImageUpload(e, 'portrait'));
                setupDragAndDrop(portraitUploadArea, portraitFileInput);
            }
            
            // 角色圖片上傳
            const characterImgUploadBtn = document.getElementById('character-img-upload-btn');
            const characterImgFileInput = document.getElementById('character-img-file-input');
            const characterImgUploadArea = document.getElementById('character-img-upload-area');
            
            if (characterImgUploadBtn && characterImgFileInput) {
                characterImgUploadBtn.addEventListener('click', () => characterImgFileInput.click());
                characterImgFileInput.addEventListener('change', (e) => handleImageUpload(e, 'character-img'));
                setupDragAndDrop(characterImgUploadArea, characterImgFileInput);
            }
            
            // 背景圖片上傳
            const backgroundUploadBtn = document.getElementById('background-upload-btn');
            const backgroundFileInput = document.getElementById('background-file-input');
            const backgroundUploadArea = document.getElementById('background-upload-area');
            
            if (backgroundUploadBtn && backgroundFileInput) {
                backgroundUploadBtn.addEventListener('click', () => backgroundFileInput.click());
                backgroundFileInput.addEventListener('change', (e) => handleImageUpload(e, 'background'));
                setupDragAndDrop(backgroundUploadArea, backgroundFileInput);
            }
            
            // 貼圖上傳
            const stickerUploadBtn = document.getElementById('sticker-upload-btn');
            const stickerFileInput = document.getElementById('sticker-file-input');
            const stickerUploadArea = document.getElementById('sticker-upload-area');
            
            if (stickerUploadBtn && stickerFileInput) {
                stickerUploadBtn.addEventListener('click', () => stickerFileInput.click());
                stickerFileInput.addEventListener('change', (e) => handleImageUpload(e, 'sticker'));
                setupDragAndDrop(stickerUploadArea, stickerFileInput);
            }
            
            // 物品圖片上傳
            const itemImgUploadBtn = document.getElementById('item-img-upload-btn');
            const itemImgFileInput = document.getElementById('item-img-file-input');
            const itemImgUploadArea = document.getElementById('item-img-upload-area');
            
            if (itemImgUploadBtn && itemImgFileInput) {
                itemImgUploadBtn.addEventListener('click', () => itemImgFileInput.click());
                itemImgFileInput.addEventListener('change', (e) => handleImageUpload(e, 'item-img'));
                setupDragAndDrop(itemImgUploadArea, itemImgFileInput);
            }
            
            // 物品類型上傳
            const itemTypeUploadBtn = document.getElementById('item-type-upload-btn');
            const itemTypeFileInput = document.getElementById('item-type-file-input');
            const itemTypeUploadArea = document.getElementById('item-type-upload-area');
            
            if (itemTypeUploadBtn && itemTypeFileInput) {
                itemTypeUploadBtn.addEventListener('click', () => itemTypeFileInput.click());
                itemTypeFileInput.addEventListener('change', (e) => handleImageUpload(e, 'item-type'));
                setupDragAndDrop(itemTypeUploadArea, itemTypeFileInput);
            }
            
            // URL圖片添加按鈕事件監聽器
            const urlAddButtons = [
                { id: 'portrait-url-add-btn', category: 'portrait' },
                { id: 'character-img-url-add-btn', category: 'character-img' },
                { id: 'background-url-add-btn', category: 'background' },
                { id: 'sticker-url-add-btn', category: 'sticker' },
                { id: 'item-img-url-add-btn', category: 'item-img' },
                { id: 'item-type-url-add-btn', category: 'item-type' }
            ];
            
            urlAddButtons.forEach(({ id, category }) => {
                const button = document.getElementById(id);
                if (button) {
                    button.addEventListener('click', () => handleUrlImageAdd(category));
                }
            });
            
            // 載入已上傳的圖片
            loadUploadedImages();
        }

        // 初始化圖片上傳功能（保留函數以維持兼容性）
        function initializeImageUpload() {
            // 這個函數現在由 setupAllUploadFunctions 處理
            // console.log('[素材設置] 圖片上傳功能初始化完成');
        }
        
        // 處理圖片上傳
        async function handleImageUpload(event, category) {
            // console.log(`[VN面板] 开始处理图片上传: ${category}, 文件数量: ${event.target.files.length}`);
            
            const files = Array.from(event.target.files);
            if (files.length === 0) return;
            
            try {
                for (const file of files) {
                    // 檢查文件類型
                    if (!file.type.startsWith('image/')) {
                        alert(`文件 ${file.name} 不是有效的圖片格式`);
                        continue;
                    }
                    
                    // console.log(`[VN面板] 處理圖片: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)}KB, 類型: ${file.type}`);
                    
                    // 顯示圖片標籤輸入模態窗口
                    if (window.showImageTagModal) {
                        window.showImageTagModal(file, category);
                    } else {
                        // 如果標籤模態窗口不可用，使用舊的方式
                        const tag = await showTagInputDialog(category, file.name);
                        if (tag) {
                            const result = await uploadImageToIndexedDB(file, category, tag);
                            if (result) {
                                // console.log(`[VN面板] 圖片上傳成功: ${result.name}, ID: ${result.id}`);
                                
                                // 立即重新載入圖片列表
                                await loadUploadedImages();
                                
                                // 验证图片是否真的保存了
                                setTimeout(async () => {
                                    const savedImages = await window.materialImageManager.getImagesByCategory(category, 'upload');
                                    // console.log(`[VN面板] 验证保存结果: ${category}分类有${savedImages.length}张图片`);
                                    if (savedImages.length === 0) {
                                        console.warn('[VN面板] 警告: 图片可能没有正确保存到IndexedDB');
                                    }
                                }, 1000);
                            }
                        }
                    }
                }
                
                // 清空文件輸入
                event.target.value = '';
                
                // console.log(`[素材設置] 處理 ${files.length} 張圖片上傳到 ${category} 分類完成`);
                
            } catch (error) {
                console.error('[素材設置] 圖片上傳失敗:', error);
                alert(`圖片上傳失敗: ${error.message}`);
            }
        }
        
        // 上傳圖片到IndexedDB
        async function uploadImageToIndexedDB(file, category) {
            if (!window.materialImageManager) {
                throw new Error('素材圖片管理器未初始化');
            }
            
            return await window.materialImageManager.uploadImage(file, category);
        }
        
        // 處理URL圖片添加
        async function handleUrlImageAdd(category) {
            const urlInput = document.getElementById(`${category}-url-input`);
            const url = urlInput.value.trim();
            
            if (!url) {
                alert('請輸入圖片URL');
                return;
            }
            
            // 驗證URL格式
            if (!isValidImageUrl(url)) {
                alert('請輸入有效的圖片URL');
                return;
            }
            
            // 顯示載入狀態
            const addBtn = document.getElementById(`${category}-url-add-btn`);
            const originalText = addBtn.textContent;
            addBtn.textContent = '添加中...';
            addBtn.disabled = true;
            
            try {
                // 驗證圖片是否可以載入
                await validateImageUrl(url);
                
                // 顯示圖片標籤輸入模態窗口
                if (window.showImageTagModal) {
                    // 創建一個模擬的File對象，標記為URL類型
                    const fakeFile = {
                        name: `url_image_${Date.now()}.jpg`,
                        type: 'url', // 標記為URL類型
                        size: 0,
                        url: url
                    };
                    window.showImageTagModal(fakeFile, category);
                } else {
                    // 如果標籤模態窗口不可用，使用舊的方式
                    const tag = await showTagInputDialog(category, `URL圖片_${Date.now()}`);
                    if (tag) {
                        await addUrlImageToIndexedDB(url, category, tag);
                    }
                }
                
                // 清空輸入框
                urlInput.value = '';
                
            } catch (error) {
                console.error('[素材設置] URL圖片添加失敗:', error);
                alert(`URL圖片添加失敗: ${error.message}`);
            } finally {
                // 恢復按鈕狀態
                addBtn.textContent = originalText;
                addBtn.disabled = false;
            }
        }
        
        // 驗證圖片URL格式
        function isValidImageUrl(url) {
            try {
                const urlObj = new URL(url);
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
                const pathname = urlObj.pathname.toLowerCase();
                return imageExtensions.some(ext => pathname.endsWith(ext)) || 
                       url.includes('catbox.moe') || 
                       url.includes('imgur.com') ||
                       url.includes('i.imgur.com');
            } catch {
                return false;
            }
        }
        
        // 驗證圖片URL是否可以載入
        function validateImageUrl(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('無法載入圖片，請檢查URL是否正確'));
                img.src = url;
            });
        }
        
        // 添加URL圖片到IndexedDB
        async function addUrlImageToIndexedDB(url, category, tag) {
            if (!window.materialImageManager) {
                throw new Error('素材圖片管理器未初始化');
            }
            
            // 創建圖片數據對象
            const imageData = {
                url: url,
                name: `URL圖片_${Date.now()}`,
                category: category,
                tag: tag,
                type: 'url'
            };
            
            return await window.materialImageManager.uploadImageWithTag(imageData);
        }
        
        // 載入已上傳的圖片
        async function loadUploadedImages() {
            if (!window.materialImageManager) return;
            
            // 獲取當前模式
            const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
            const currentMode = savedSettings.sourceMode || 'url';
            
            try {
                if (currentMode === 'upload') {
                    // 上傳模式：載入Base64格式的圖片
                    const portraitImages = await window.materialImageManager.getImagesByCategory('portrait', 'upload');
                    renderImageList('portrait-image-list', portraitImages, 'portrait');
                    
                    const characterImgImages = await window.materialImageManager.getImagesByCategory('character-img', 'upload');
                    renderImageList('character-img-image-list', characterImgImages, 'character-img');
                    
                    const backgroundImages = await window.materialImageManager.getImagesByCategory('background', 'upload');
                    renderImageList('background-image-list', backgroundImages, 'background');
                    
                    const stickerImages = await window.materialImageManager.getImagesByCategory('sticker', 'upload');
                    renderImageList('sticker-image-list', stickerImages, 'sticker');
                    
                    const itemImgImages = await window.materialImageManager.getImagesByCategory('item-img', 'upload');
                    renderImageList('item-img-image-list', itemImgImages, 'item-img');
                    
                    const itemTypeImages = await window.materialImageManager.getImagesByCategory('item-type', 'upload');
                    renderImageList('item-type-image-list', itemTypeImages, 'item-type');
                    
                } else if (currentMode === 'url-single') {
                    // URL單張模式：載入URL格式的圖片
                    const portraitImages = await window.materialImageManager.getImagesByCategory('portrait', 'url-single');
                    renderImageList('portrait-url-image-list', portraitImages, 'portrait');
                    
                    const characterImgImages = await window.materialImageManager.getImagesByCategory('character-img', 'url-single');
                    renderImageList('character-img-url-image-list', characterImgImages, 'character-img');
                    
                    const backgroundImages = await window.materialImageManager.getImagesByCategory('background', 'url-single');
                    renderImageList('background-url-image-list', backgroundImages, 'background');
                    
                    const stickerImages = await window.materialImageManager.getImagesByCategory('sticker', 'url-single');
                    renderImageList('sticker-url-image-list', stickerImages, 'sticker');
                    
                    const itemImgImages = await window.materialImageManager.getImagesByCategory('item-img', 'url-single');
                    renderImageList('item-img-url-image-list', itemImgImages, 'item-img');
                    
                    const itemTypeImages = await window.materialImageManager.getImagesByCategory('item-type', 'url-single');
                    renderImageList('item-type-url-image-list', itemTypeImages, 'item-type');
                }
                
            } catch (error) {
                console.error('[素材設置] 載入圖片失敗:', error);
            }
        }
        
        // 渲染圖片列表
        function renderImageList(containerId, images, category) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            if (images.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: var(--text-color-muted); padding: 20px;">暫無上傳的圖片</div>';
                return;
            }
            
            container.innerHTML = images.map(image => {
                // 根據圖片類型顯示不同的信息
                const isUrlImage = image.type === 'url';
                const sizeText = isUrlImage ? 'URL圖片' : `${(image.size / 1024).toFixed(1)} KB`;
                
                return `
                <div class="image-item" data-id="${image.id}">
                    <img src="${image.url}" alt="${image.name}" class="image-preview" onclick="previewImage('${image.url}', '${image.name}')">
                    <div class="image-info">
                        <div class="image-name">${image.name}</div>
                        <div class="image-size">${sizeText}</div>
                    </div>
                    <div class="image-actions">
                        <button class="image-action-btn delete" onclick="deleteImage(${image.id}, '${category}')" title="刪除">×</button>
                    </div>
                </div>
            `;
            }).join('');
        }
        
        // 預覽圖片
        function previewImage(url, name) {
            // 創建圖片預覽模態窗口
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.9);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            `;
            
            modal.innerHTML = `
                <div style="text-align: center;">
                    <img src="${url}" alt="${name}" style="max-width: 90vw; max-height: 90vh; object-fit: contain;">
                    <div style="color: white; margin-top: 10px; font-size: 14px;">${name}</div>
                </div>
            `;
            
            modal.addEventListener('click', () => {
                document.body.removeChild(modal);
                if (window.materialImageManager) {
                    window.materialImageManager.releaseBlobURL(url);
                }
            });
            
            document.body.appendChild(modal);
        }
        
        // 刪除圖片
        async function deleteImage(id, category) {
            if (!confirm('確定要刪除這張圖片嗎？')) return;
            
            try {
                if (!window.materialImageManager) {
                    throw new Error('素材圖片管理器未初始化');
                }
                
                await window.materialImageManager.deleteImage(id);
                await loadUploadedImages();
                
                // console.log(`[素材設置] 成功刪除圖片 ${id}`);
                
            } catch (error) {
                console.error('[素材設置] 刪除圖片失敗:', error);
                alert(`刪除圖片失敗: ${error.message}`);
            }
        }
        
        // 設置拖拽上傳
        function setupDragAndDrop(uploadArea, fileInput) {
            if (!uploadArea) return;
            
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    fileInput.files = e.dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change'));
                }
            });
                                   }

            // 保存素材設置
            function saveMaterialSettings() {
                const settings = {
                    // 保存当前模式设置
                    sourceMode: currentSourceMode || 'url',
                    portrait: {
                        baseUrl: portraitBaseUrlInput.value.trim(),
                        format: portraitFormatInput.value.trim()
                    },
                    bgm: {
                        baseUrl: bgmBaseUrlInput.value.trim(),
                        format: bgmFormatInput.value.trim()
                    },
                    soundEffect: {
                        baseUrl: soundEffectBaseUrlInput.value.trim(),
                        format: soundEffectFormatInput.value.trim()
                    },
                    characterImg: {
                        baseUrl: characterImgBaseUrlInput.value.trim(),
                        format: characterImgFormatInput.value.trim()
                    },
                    background: {
                        baseUrl: backgroundBaseUrlInput.value.trim(),
                        fallbackUrl: backgroundFallbackUrlInput.value.trim(),
                        format: backgroundFormatInput.value.trim()
                    },
                    areaGif: {
                        baseUrl: areaGifBaseUrlInput.value.trim(),
                        format: areaGifFormatInput.value.trim()
                    },
                    sticker: {
                        baseUrl: stickerBaseUrlInput.value.trim(),
                        defaultUrl: stickerDefaultUrlInput.value.trim(),
                        format: stickerFormatInput.value.trim()
                    },
                    itemImg: {
                        baseUrl: itemImgBaseUrlInput.value.trim(),
                        format: itemImgFormatInput.value.trim()
                    },
                    itemType: {
                        baseUrl: itemTypeBaseUrlInput.value.trim(),
                        format: itemTypeFormatInput.value.trim()
                    },
                    timestamp: Date.now()
                };
                
                localStorage.setItem('vn_material_settings', JSON.stringify(settings));
                // console.log('[VN面板] 素材設置已保存:', settings);
                
                // 顯示成功消息
                if (window.showCustomAlert) {
                    window.showCustomAlert('保存成功', '素材設置已保存！');
                } else {
                    alert('素材設置已保存！');
                }
            }

            // 生成立繪URL（預設設置）
            async function generatePortraitUrl(characterName) {
                // 檢查是否使用上傳模式
                const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
                const isUploadMode = savedSettings.sourceMode === 'upload';
                
                if ((isUploadMode || currentSourceMode === 'url-single') && window.materialImageManager) {
                    // 上傳模式或URL單張模式：從IndexedDB獲取預設圖片
                    try {
                        const mode = currentSourceMode === 'url-single' ? 'url-single' : 'upload';
                        const images = await window.materialImageManager.getImagesByCategory('portrait', mode);
                        
                        // 構建搜索文件名
                        const cleanCharacterName = characterName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                        const searchFileName = cleanCharacterName;
                        
                        // 查找匹配的圖片
                        const matchedImage = images.find(img => {
                            const imgName = img.name.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
                            return imgName === searchFileName || imgName.includes(searchFileName);
                        });
                        
                        if (matchedImage) {
                            // console.log('[VNMaterialProcessor] 從IndexedDB找到預設圖片:', matchedImage.name, '類型:', matchedImage.type);
                            return matchedImage.url;
                        } else {
                            console.warn('[VNMaterialProcessor] IndexedDB中未找到預設圖片，使用預設URL:', searchFileName);
                        }
                    } catch (error) {
                        console.error('[VNMaterialProcessor] 從IndexedDB獲取預設圖片失敗:', error);
                    }
                }
                
                // URL模式或IndexedDB未找到：使用URL構建
                const baseUrl = portraitBaseUrlInput.value.trim();
                const format = portraitFormatInput.value.trim();
                
                if (!baseUrl || !characterName) {
                    return null;
                }
                
                // 清理角色名（保留下底線和連字符，移除其他特殊字符）
                const cleanCharacterName = characterName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const portraitUrl = baseUrl + cleanCharacterName + format;
                
                 console.log('[VN面板] 生成立繪URL:', {
                    characterName: characterName,
                    cleanName: cleanCharacterName,
                    url: portraitUrl,
                    mode: isUploadMode ? 'upload' : 'url'
                });
                
                return portraitUrl;
            }

            // 生成BGM URL
            function generateBgmUrl(bgmName) {
                const baseUrl = bgmBaseUrlInput.value.trim();
                const format = bgmFormatInput.value.trim();
                
                if (!baseUrl || !bgmName) {
                    return null;
                }
                
                // 清理BGM名稱（保留下底線和連字符，移除其他特殊字符）
                const cleanBgmName = bgmName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const bgmUrl = baseUrl + cleanBgmName + format;
                
                 console.log('[VN面板] 生成BGM URL:', {
                    bgmName: bgmName,
                    cleanName: cleanBgmName,
                    url: bgmUrl
                });
                
                return bgmUrl;
            }

            // 生成音效URL
            function generateSoundEffectUrl(soundEffectName) {
                const baseUrl = soundEffectBaseUrlInput.value.trim();
                const format = soundEffectFormatInput.value.trim();
                
                if (!baseUrl || !soundEffectName) {
                    return null;
                }
                
                // 清理音效名稱（保留下底線和連字符，移除其他特殊字符）
                const cleanSoundEffectName = soundEffectName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const soundEffectUrl = baseUrl + cleanSoundEffectName + format;
                
                 console.log('[VN面板] 生成音效URL:', {
                    soundEffectName: soundEffectName,
                    cleanName: cleanSoundEffectName,
                    url: soundEffectUrl
                });
                
                return soundEffectUrl;
            }

            // 生成角色圖片URL
            function generateCharacterImgUrl(characterName, emotion = '') {
                const baseUrl = characterImgBaseUrlInput.value.trim();
                const format = characterImgFormatInput.value.trim();
                
                if (!baseUrl || !characterName) {
                    return null;
                }
                
                // 清理角色名和表情（保留下底線和連字符，移除其他特殊字符）
                const cleanCharacterName = characterName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const cleanEmotion = emotion.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                
                let characterImgUrl;
                if (emotion && cleanEmotion) {
                    characterImgUrl = baseUrl + cleanCharacterName + '_' + cleanEmotion + format;
                } else {
                    characterImgUrl = baseUrl + cleanCharacterName + format;
                }
                
                 console.log('[VN面板] 生成角色圖片URL:', {
                    characterName: characterName,
                    emotion: emotion,
                    cleanName: cleanCharacterName,
                    cleanEmotion: cleanEmotion,
                    url: characterImgUrl
                });
                
                return characterImgUrl;
            }

            // 生成背景圖片URL
            function generateBackgroundUrl(locationName) {
                const baseUrl = backgroundBaseUrlInput.value.trim();
                const format = backgroundFormatInput.value.trim();
                
                if (!baseUrl || !locationName) {
                    return null;
                }
                
                // 清理地點名（保留下底線和連字符，移除其他特殊字符）
                const cleanLocationName = locationName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const backgroundUrl = baseUrl + cleanLocationName + format;
                
                 console.log('[VN面板] 生成背景圖片URL:', {
                    locationName: locationName,
                    cleanName: cleanLocationName,
                    url: backgroundUrl
                });
                
                return backgroundUrl;
            }

            // 生成Area GIF URL
            function generateAreaGifUrl(areaName) {
                const baseUrl = areaGifBaseUrlInput.value.trim();
                const format = areaGifFormatInput.value.trim();
                
                if (!baseUrl || !areaName) {
                    return null;
                }
                
                // 清理區域名（保留下底線和連字符，移除其他特殊字符）
                const cleanAreaName = areaName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const areaGifUrl = baseUrl + cleanAreaName + format;
                
                 console.log('[VN面板] 生成Area GIF URL:', {
                    areaName: areaName,
                    cleanName: cleanAreaName,
                    url: areaGifUrl
                });
                
                return areaGifUrl;
            }

            // 生成貼圖URL
            function generateStickerUrl(stickerName) {
                const baseUrl = stickerBaseUrlInput.value.trim();
                const format = stickerFormatInput.value.trim();
                
                if (!baseUrl || !stickerName) {
                    return null;
                }
                
                // 清理貼圖名（保留下底線和連字符，移除其他特殊字符）
                const cleanStickerName = stickerName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const stickerUrl = baseUrl + cleanStickerName + format;
                
                 console.log('[VN面板] 生成貼圖URL:', {
                    stickerName: stickerName,
                    cleanName: cleanStickerName,
                    url: stickerUrl
                });
                
                return stickerUrl;
            }

            // 生成物品圖片URL
            function generateItemImgUrl(itemName) {
                const baseUrl = itemImgBaseUrlInput.value.trim();
                const format = itemImgFormatInput.value.trim();
                
                if (!baseUrl || !itemName) {
                    return null;
                }
                
                // 清理物品名稱（保留下底線和連字符，移除其他特殊字符）
                const cleanItemName = itemName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const itemImgUrl = baseUrl + cleanItemName + format;
                
                 console.log('[VN面板] 生成物品圖片URL:', {
                    itemName: itemName,
                    cleanName: cleanItemName,
                    url: itemImgUrl
                });
                
                return itemImgUrl;
            }

            // 生成物品類型URL
            function generateItemTypeUrl(itemTypeName) {
                const baseUrl = itemTypeBaseUrlInput.value.trim();
                const format = itemTypeFormatInput.value.trim();
                
                if (!baseUrl || !itemTypeName) {
                    return null;
                }
                
                // 清理物品類型名（保留下底線和連字符，移除其他特殊字符）
                const cleanItemTypeName = itemTypeName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const itemTypeUrl = baseUrl + cleanItemTypeName + format;
                
                 console.log('[VN面板] 生成物品類型URL:', {
                    itemTypeName: itemTypeName,
                    cleanName: cleanItemTypeName,
                    url: itemTypeUrl
                });
                
                return itemTypeUrl;
            }

            // 測試按鈕事件已在 bindTestButtonEvents() 函數中綁定

            // 提供全局函數供其他模塊使用
            window.VNMaterialProcessor = {
                // 獲取當前來源模式
                getSourceMode: function() {
                    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
                    return savedSettings.sourceMode || 'url';
                },
                
                // 立繪相關（預設設置）
                generatePortraitUrl: generatePortraitUrl,
                getPortraitSettings: function() {
                    return {
                        baseUrl: portraitBaseUrlInput.value.trim(),
                        format: portraitFormatInput.value.trim()
                    };
                },
                setPortraitConfig: function(baseUrl, format) {
                    if (baseUrl) portraitBaseUrlInput.value = baseUrl;
                    if (format) portraitFormatInput.value = format;
                },
                
                // BGM相關
                generateBgmUrl: generateBgmUrl,
                getBgmSettings: function() {
                    return {
                        baseUrl: bgmBaseUrlInput.value.trim(),
                        format: bgmFormatInput.value.trim()
                    };
                },
                setBgmConfig: function(baseUrl, format) {
                    if (baseUrl) bgmBaseUrlInput.value = baseUrl;
                    if (format) bgmFormatInput.value = format;
                },
                
                // 音效相關
                generateSoundEffectUrl: generateSoundEffectUrl,
                getSoundEffectSettings: function() {
                    return {
                        baseUrl: soundEffectBaseUrlInput.value.trim(),
                        format: soundEffectFormatInput.value.trim(),
                        popupSoundUrl: 'https://nancywang3641.github.io/sound-files/popup.wav' // 彈窗音效URL
                    };
                },
                setSoundEffectConfig: function(baseUrl, format) {
                    if (baseUrl) soundEffectBaseUrlInput.value = baseUrl;
                    if (format) soundEffectFormatInput.value = format;
                },
                
                // 角色圖片相關
                generateCharacterImgUrl: generateCharacterImgUrl,
                getCharacterImgSettings: function() {
                    return {
                        baseUrl: characterImgBaseUrlInput ? characterImgBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/char_img/',
                        format: characterImgFormatInput ? characterImgFormatInput.value.trim() : '.png'
                    };
                },
                setCharacterImgConfig: function(baseUrl, format) {
                    if (baseUrl && characterImgBaseUrlInput) characterImgBaseUrlInput.value = baseUrl;
                    if (format && characterImgFormatInput) characterImgFormatInput.value = format;
                },
                
                // 背景圖片相關
                generateBackgroundUrl: generateBackgroundUrl,
                getBackgroundSettings: function() {
                    return {
                        baseUrl: backgroundBaseUrlInput ? backgroundBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/location_img/',
                        fallbackUrl: backgroundFallbackUrlInput ? backgroundFallbackUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/location_img/default.jpeg',
                        imageFormat: backgroundFormatInput ? backgroundFormatInput.value.trim() : '.jpeg'
                    };
                },
                setBackgroundConfig: function(baseUrl, fallbackUrl, format) {
                    if (baseUrl && backgroundBaseUrlInput) backgroundBaseUrlInput.value = baseUrl;
                    if (fallbackUrl && backgroundFallbackUrlInput) backgroundFallbackUrlInput.value = fallbackUrl;
                    if (format && backgroundFormatInput) backgroundFormatInput.value = format;
                },
                
                // Area GIF相關
                generateAreaGifUrl: generateAreaGifUrl,
                getAreaGifSettings: function() {
                    return {
                        baseUrl: areaGifBaseUrlInput ? areaGifBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/Area_img/',
                        format: areaGifFormatInput ? areaGifFormatInput.value.trim() : '.gif'
                    };
                },
                setAreaGifConfig: function(baseUrl, format) {
                    if (baseUrl && areaGifBaseUrlInput) areaGifBaseUrlInput.value = baseUrl;
                    if (format && areaGifFormatInput) areaGifFormatInput.value = format;
                },
                
                // 貼圖相關
                generateStickerUrl: generateStickerUrl,
                getStickerSettings: function() {
                    return {
                        baseUrl: stickerBaseUrlInput ? stickerBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/sticker/',
                        defaultUrl: stickerDefaultUrlInput ? stickerDefaultUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/sticker/default.jpg',
                        format: stickerFormatInput ? stickerFormatInput.value.trim() : '.jpg'
                    };
                },
                setStickerConfig: function(baseUrl, defaultUrl, format) {
                    if (baseUrl && stickerBaseUrlInput) stickerBaseUrlInput.value = baseUrl;
                    if (defaultUrl && stickerDefaultUrlInput) stickerDefaultUrlInput.value = defaultUrl;
                    if (format && stickerFormatInput) stickerFormatInput.value = format;
                },
                
                // 物品圖片相關
                generateItemImgUrl: generateItemImgUrl,
                getItemImgSettings: function() {
                    return {
                        baseUrl: itemImgBaseUrlInput ? itemImgBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/item_img/',
                        format: itemImgFormatInput ? itemImgFormatInput.value.trim() : '.png'
                    };
                },
                setItemImgConfig: function(baseUrl, format) {
                    if (baseUrl && itemImgBaseUrlInput) itemImgBaseUrlInput.value = baseUrl;
                    if (format && itemImgFormatInput) itemImgFormatInput.value = format;
                },
                
                // 物品類型相關
                generateItemTypeUrl: generateItemTypeUrl,
                getItemTypeSettings: function() {
                    return {
                        baseUrl: itemTypeBaseUrlInput ? itemTypeBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/item_type/',
                        format: itemTypeFormatInput ? itemTypeFormatInput.value.trim() : '.png'
                    };
                },
                setItemTypeConfig: function(baseUrl, format) {
                    if (baseUrl && itemTypeBaseUrlInput) itemTypeBaseUrlInput.value = baseUrl;
                    if (format && itemTypeFormatInput) itemTypeFormatInput.value = format;
                },
                
                // 通用設置
                saveSettings: saveMaterialSettings
            };

            // 為了向後兼容，保留舊的立繪處理器（如果還沒有定義的話）
            if (!window.VNPortraitProcessor) {
            window.VNPortraitProcessor = {
                generatePortraitUrl: generatePortraitUrl,
                getSettings: function() {
                    return {
                        baseUrl: portraitBaseUrlInput.value.trim(),
                        format: portraitFormatInput.value.trim()
                    };
                },
                setConfig: function(baseUrl, format) {
                    if (baseUrl) portraitBaseUrlInput.value = baseUrl;
                    if (format) portraitFormatInput.value = format;
                }
            };
            }

            // ========== 图片压缩修复代码 - 开始 ==========
// 图片压缩和大小限制修复

// 1. 图片压缩工具函数
function compressImage(file, maxWidth = 800, maxHeight = 600, quality = 0.8) {
    return new Promise((resolve, reject) => {
        // 检查文件大小 - 限制为5MB
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            console.warn(`[图片压缩] 文件过大: ${(file.size / 1024 / 1024).toFixed(2)}MB，将进行压缩`);
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function() {
            try {
                // 计算压缩后的尺寸
                let { width, height } = calculateCompressedSize(img.width, img.height, maxWidth, maxHeight);
                
                canvas.width = width;
                canvas.height = height;

                // 绘制压缩后的图片
                ctx.fillStyle = 'white'; // 白色背景
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // 转换为Blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        // console.log(`[图片压缩] 压缩完成: ${img.width}x${img.height} -> ${width}x${height}, ${(file.size / 1024).toFixed(1)}KB -> ${(blob.size / 1024).toFixed(1)}KB`);
                        
                        // 创建新的文件对象
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg', // 统一转换为JPEG格式
                            lastModified: Date.now()
                        });
                        
                        resolve(compressedFile);
                    } else {
                        reject(new Error('图片压缩失败'));
                    }
                }, 'image/jpeg', quality);

            } catch (error) {
                console.error('[图片压缩] 压缩过程出错:', error);
                reject(error);
            }
        };

        img.onerror = () => {
            reject(new Error('图片加载失败'));
        };

        // 创建图片URL
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.onerror = () => {
            reject(new Error('文件读取失败'));
        };
        reader.readAsDataURL(file);
    });
}

// 2. 计算压缩尺寸
function calculateCompressedSize(originalWidth, originalHeight, maxWidth, maxHeight) {
    let width = originalWidth;
    let height = originalHeight;

    // 如果图片过大，按比例缩放
    if (width > maxWidth || height > maxHeight) {
        const widthRatio = maxWidth / width;
        const heightRatio = maxHeight / height;
        const ratio = Math.min(widthRatio, heightRatio);

        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
    }

    return { width, height };
}

// 3. 处理进度指示器
function showImageProcessingIndicator(message) {
    // 移除旧的指示器
    hideImageProcessingIndicator();
    
    const indicator = document.createElement('div');
    indicator.id = 'image-processing-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px 30px;
        border-radius: 10px;
        z-index: 10001;
        text-align: center;
        font-size: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;
    indicator.innerHTML = `
        <div style="margin-bottom: 10px;">${message}</div>
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    
    document.body.appendChild(indicator);
}

function hideImageProcessingIndicator() {
    const indicator = document.getElementById('image-processing-indicator');
    if (indicator) {
        indicator.parentNode.removeChild(indicator);
    }
}

    // console.log('[VN面板] 图片压缩修复已加载');
    
    // 添加调试功能
    window.testImageDataIntegrity = async function() {
        // console.log('[調試] 開始測試圖片數據完整性');
        
        if (!window.materialImageManager) {
            console.error('[調試] materialImageManager 未初始化');
            return;
        }
        
        try {
            const images = await window.materialImageManager.getImagesByCategory('portrait');
            // console.log(`[調試] 找到 ${images.length} 張圖片`);
            
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                 console.log(`[調試] 測試圖片 ${i + 1}: ${img.name}`);
                 console.log(`[調試] 圖片詳情:`, {
                    name: img.name,
                    type: img.type,
                    size: img.size,
                    hasBlob: !!img.blob,
                    hasUrl: !!img.url,
                    urlType: img.url ? img.url.split(';')[0] : 'null'
                });
                
                if (img.blob) {
                     console.log(`[調試] Blob詳情: 大小 ${(img.blob.size / 1024).toFixed(1)}KB, 類型 ${img.blob.type}`);
                }
                
                if (img.url) {
                    // 检查 URL 格式
                    if (img.url.startsWith('blob:')) {
                        // console.log(`[調試] 圖片 ${img.name} 使用 Blob URL`);
                    } else if (img.url.startsWith('data:')) {
                        // console.log(`[調試] 圖片 ${img.name} 使用 Base64 URL`);
                    } else if (img.url.startsWith('http://') || img.url.startsWith('https://')) {
                        // console.log(`[調試] 圖片 ${img.name} 使用 HTTP URL`);
                    } else {
                        console.error(`[調試] 圖片 ${img.name} URL格式不正確: ${img.url.substring(0, 50)}...`);
                        continue;
                    }
                    
                    // 尝试创建图片对象测试
                    const testImg = new Image();
                    testImg.onload = function() {
                         console.log(`[調試] 圖片 ${img.name} 數據完整，尺寸: ${this.width}x${this.height}`);
                    };
                    testImg.onerror = function() {
                        console.error(`[調試] 圖片 ${img.name} 數據損壞，無法加載`);
                        console.error(`[調試] 圖片 ${img.name} URL: ${img.url}`);
                    };
                    testImg.src = img.url;
                }
            }
        } catch (error) {
            console.error('[調試] 測試圖片數據完整性失敗:', error);
        }
    };
    
    // 清理损坏的图片数据
    window.cleanupCorruptedImages = async function() {
        // console.log('[調試] 開始清理損壞的圖片數據');
        
        if (!window.materialImageManager) {
            console.error('[調試] materialImageManager 未初始化');
            return;
        }
        
        try {
            const images = await window.materialImageManager.getImagesByCategory('portrait');
            // console.log(`[調試] 檢查 ${images.length} 張圖片`);
            
            let deletedCount = 0;
            
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                
                // 检查图片类型
                if (img.type === 'url') {
                    // URL类型图片，检查HTTP URL格式
                    if (!img.url || (!img.url.startsWith('http://') && !img.url.startsWith('https://'))) {
                        // console.log(`[調試] 刪除無有效HTTP URL的圖片: ${img.name}`);
                        await window.materialImageManager.deleteImage(img.id);
                        deletedCount++;
                        continue;
                    }
                } else {
                    // Base64类型图片，检查Base64格式
                    if (!img.url || !img.url.startsWith('data:image/')) {
                        // console.log(`[調試] 刪除無有效 Base64 數據的圖片: ${img.name}`);
                        await window.materialImageManager.deleteImage(img.id);
                        deletedCount++;
                        continue;
                    }
                }
                
                // 验证 Base64 数据完整性
                const parts = img.url.split(',');
                if (parts.length !== 2 || parts[1].length < 100) {
                    // console.log(`[調試] 刪除 Base64 數據不完整的圖片: ${img.name}`);
                    await window.materialImageManager.deleteImage(img.id);
                    deletedCount++;
                    continue;
                }
                
                // 测试图片是否可以正常加载
                if (img.url) {
                    const testImg = new Image();
                    const canLoad = await new Promise((resolve) => {
                        testImg.onload = () => resolve(true);
                        testImg.onerror = () => resolve(false);
                        testImg.src = img.url;
                    });
                    
                    if (!canLoad) {
                        // console.log(`[調試] 刪除損壞的圖片: ${img.name}`);
                        await window.materialImageManager.deleteImage(img.id);
                        deletedCount++;
                    }
                }
            }
            
            // console.log(`[調試] 清理完成，刪除了 ${deletedCount} 張損壞的圖片`);
        } catch (error) {
            console.error('[調試] 清理損壞圖片失敗:', error);
        }
    };
    
    // 测试 Base64 数据有效性
    window.testBase64Data = async function() {
        // console.log('[調試] 開始測試 Base64 數據有效性');
        
        if (!window.materialImageManager) {
            console.error('[調試] materialImageManager 未初始化');
            return;
        }
        
        try {
            const images = await window.materialImageManager.getImagesByCategory('portrait');
            // console.log(`[調試] 找到 ${images.length} 張圖片`);
            
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                // console.log(`[調試] 測試圖片 ${i + 1}: ${img.name}`);
                
                if (img.url && img.url.startsWith('data:image/')) {
                     console.log(`[調試] Base64 詳情:`, {
                        length: img.url.length,
                        type: img.type,
                        startsWith: img.url.substring(0, 50),
                        endsWith: img.url.substring(img.url.length - 20)
                    });
                    
                    // 验证 Base64 格式
                    const parts = img.url.split(',');
                    if (parts.length !== 2) {
                        console.error(`[調試] 圖片 ${img.name} Base64 格式錯誤`);
                        continue;
                    }
                    
                    const header = parts[0];
                    const data = parts[1];
                    
                    // console.log(`[調試] Base64 頭部: ${header}`);
                    // console.log(`[調試] Base64 數據長度: ${data.length}`);
                    
                    // 检查 Base64 数据是否完整
                    if (data.length % 4 !== 0) {
                        console.error(`[調試] 圖片 ${img.name} Base64 數據不完整 (長度: ${data.length})`);
                    }
                    
                    // 测试图片加载
                    const testImg = new Image();
                    testImg.onload = function() {
                        // console.log(`[調試] 圖片 ${img.name} 加載成功，尺寸: ${this.width}x${this.height}`);
                    };
                    testImg.onerror = function() {
                        console.error(`[調試] 圖片 ${img.name} 加載失敗`);
                        console.error(`[調試] 圖片 ${img.name} Base64 數據: ${img.url.substring(0, 100)}...`);
                    };
                    testImg.src = img.url;
                    
                } else {
                    console.warn(`[調試] 圖片 ${img.name} 沒有有效的 Base64 數據`);
                }
            }
        } catch (error) {
            console.error('[調試] 測試 Base64 數據失敗:', error);
        }
    };
    
    // 快速测试当前图片
    window.testCurrentImage = function() {
        // console.log('[調試] 快速測試當前圖片');
        
        // 创建一个简单的测试图片
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        
        // 绘制一个简单的图案
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 100, 100);
        ctx.fillStyle = 'white';
        ctx.fillRect(25, 25, 50, 50);
        
        // 转换为 Base64
        const testBase64 = canvas.toDataURL('image/png');
        // console.log(`[調試] 測試 Base64 長度: ${testBase64.length}`);
        
        // 测试加载
        const testImg = new Image();
        testImg.onload = function() {
            // console.log(`[調試] 測試圖片加載成功，尺寸: ${this.width}x${this.height}`);
        };
        testImg.onerror = function() {
            console.error(`[調試] 測試圖片加載失敗`);
        };
        testImg.src = testBase64;
    };
    
    // 环境检测和修复
    window.checkEnvironment = function() {
        // console.log('[調試] 環境檢測開始');
        
        const env = {
            protocol: window.location.protocol,
            hostname: window.location.hostname,
            port: window.location.port,
            href: window.location.href,
            isFile: window.location.protocol === 'file:',
            isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
            isSandboxed: window.location.href.includes('sandbox'),
            userAgent: navigator.userAgent
        };
        
        // console.log('[調試] 環境信息:', env);
        
        if (env.isFile) {
            console.warn('[調試] 警告: 當前在 file:// 協議下運行');
            console.warn('[調試] 建議: 使用本地伺服器 (如 http-server, live-server)');
            console.warn('[調試] 命令: npx http-server 或 python -m http.server');
        }
        
        if (env.isSandboxed) {
            console.warn('[調試] 警告: 當前在 sandbox 環境下運行');
            console.warn('[調試] 建議: 添加 allow-same-origin 權限');
        }
        
        // 测试图片加载能力
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 10;
        testCanvas.height = 10;
        const testCtx = testCanvas.getContext('2d');
        testCtx.fillStyle = 'black';
        testCtx.fillRect(0, 0, 10, 10);
        
        const testDataUrl = testCanvas.toDataURL('image/png');
        const testImg = new Image();
        
        testImg.onload = function() {
            // console.log('[調試] 圖片加載測試: 成功');
        };
        
        testImg.onerror = function() {
            console.error('[調試] 圖片加載測試: 失敗');
        };
        
        testImg.src = testDataUrl;
        
        return env;
    };
    
    // 测试透明背景压缩
    window.testTransparencyCompression = function() {
        // console.log('[調試] 測試透明背景壓縮');
        
        // 创建一个带透明背景的测试图片
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        
        // 绘制一个带透明背景的图案
        ctx.clearRect(0, 0, 200, 200); // 透明背景
        ctx.fillStyle = 'red';
        ctx.fillRect(50, 50, 100, 100); // 红色方块
        ctx.fillStyle = 'blue';
        ctx.fillRect(75, 75, 50, 50); // 蓝色方块
        
        // 测试 PNG 压缩
        canvas.toBlob((blob) => {
            // console.log(`[調試] PNG 壓縮結果: 大小 ${(blob.size / 1024).toFixed(1)}KB, 類型 ${blob.type}`);
            
            // 转换为 Base64 测试
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                // console.log(`[調試] Base64 長度: ${base64.length}`);
                
                // 测试加载
                const testImg = new Image();
                testImg.onload = function() {
                    // console.log(`[調試] 透明圖片加載成功，尺寸: ${this.width}x${this.height}`);
                };
                testImg.onerror = function() {
                    console.error(`[調試] 透明圖片加載失敗`);
                };
                testImg.src = base64;
            };
            reader.readAsDataURL(blob);
        }, 'image/png', 0.8);
    };


    // =======================================================================
//                            音頻標籤輸入模態窗口功能
// =======================================================================

// 音頻標籤輸入模態窗口相關變數
let audioTagModal = null;
let audioTagFileName = null;
let audioTagFileUrl = null;
let audioTagCategory = null;
let audioTagLabel = null;
let audioTagHelpText = null;
let audioTagPreviewResult = null;
let confirmAudioTag = null;
let cancelAudioTag = null;
let closeAudioTag = null;

// 當前音頻信息
let currentAudioUrl = null;
let currentAudioCategory = null;
let currentAudioName = null;

// 初始化音頻標籤輸入模態窗口
function initializeAudioTagModal() {
    // 獲取DOM元素
    audioTagModal = document.getElementById('audioTagModal');
    audioTagFileName = document.getElementById('audioTagFileName');
    audioTagFileUrl = document.getElementById('audioTagFileUrl');
    audioTagCategory = document.getElementById('audioTagCategory');
    audioTagLabel = document.getElementById('audioTagLabel');
    audioTagHelpText = document.getElementById('audioTagHelpText');
    audioTagPreviewResult = document.getElementById('audioTagPreviewResult');
    confirmAudioTag = document.getElementById('confirmAudioTag');
    cancelAudioTag = document.getElementById('cancelAudioTag');
    closeAudioTag = document.getElementById('closeAudioTag');

    if (!audioTagModal) {
        console.error('[VN面板] 音頻標籤輸入模態窗口元素未找到');
        return;
    }

    // 綁定事件監聽器
    setupAudioTagEventListeners();
    
    // console.log('[VN面板] 音頻標籤輸入模態窗口已初始化成功');
}

// 設置音頻標籤輸入模態窗口事件監聽器
function setupAudioTagEventListeners() {
    // 關閉按鈕事件
    if (closeAudioTag) {
        closeAudioTag.addEventListener('click', closeAudioTagModal);
    }

    if (cancelAudioTag) {
        cancelAudioTag.addEventListener('click', closeAudioTagModal);
    }

    // 確認按鈕事件
    if (confirmAudioTag) {
        confirmAudioTag.addEventListener('click', handleAudioTagConfirm);
    }

    // 標籤輸入事件
    if (audioTagLabel) {
        audioTagLabel.addEventListener('input', updateAudioTagPreview);
    }

    // 點擊背景關閉
    if (audioTagModal) {
        audioTagModal.addEventListener('click', function(e) {
            if (e.target === audioTagModal) {
                closeAudioTagModal();
            }
        });
    }

    // ESC鍵關閉
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && audioTagModal && audioTagModal.classList.contains('modal-active')) {
            closeAudioTagModal();
        }
    });
}

// 顯示音頻標籤輸入模態窗口
function showAudioTagModal(audioUrl, category, audioName = '') {
    if (!audioUrl) {
        console.error('[VN面板] 无法显示音頻標籤输入模态窗口：URL为空');
        return;
    }

    if (!audioTagModal) {
        console.error('[VN面板] 音頻標籤输入模态窗口元素未找到');
        return;
    }

    // 保存當前音頻信息
    currentAudioUrl = audioUrl;
    currentAudioCategory = category;
    currentAudioName = audioName || `音頻_${Date.now()}`;

    // 設置音頻信息
    if (audioTagFileName) {
        audioTagFileName.textContent = currentAudioName;
    }

    if (audioTagFileUrl) {
        audioTagFileUrl.textContent = audioUrl;
    }

    // 設置分類
    if (audioTagCategory) {
        audioTagCategory.value = category || 'bgm';
    }

    // 更新分類顯示
    const categoryDisplay = document.getElementById('audioCategoryDisplay');
    if (categoryDisplay) {
        const categoryNames = {
            'bgm': 'BGM音樂',
            'sound-effect': '音效'
        };
        categoryDisplay.textContent = categoryNames[category] || 'BGM音樂';
    }

    // 清空標籤輸入
    if (audioTagLabel) {
        audioTagLabel.value = '';
    }

    // 更新預覽
    updateAudioTagPreview();

    // 顯示模態窗口
    audioTagModal.classList.add('modal-active');

     console.log('[VN面板] 显示音頻標籤输入模态窗口:', {
        audioUrl: audioUrl,
        category: category,
        audioName: currentAudioName
    });
}

// 關閉音頻標籤輸入模態窗口
function closeAudioTagModal() {
    if (!audioTagModal) return;

    audioTagModal.classList.remove('modal-active');
    
    // 清空當前音頻信息
    currentAudioUrl = null;
    currentAudioCategory = null;
    currentAudioName = null;

    // console.log('[VN面板] 關閉音頻標籤输入模态窗口');
}

// 更新音頻標籤預覽
function updateAudioTagPreview() {
    if (!audioTagPreviewResult || !audioTagLabel) return;

    const label = audioTagLabel.value.trim();

    if (!label) {
        audioTagPreviewResult.textContent = '未設置標籤';
        if (confirmAudioTag) confirmAudioTag.disabled = true;
        return;
    }

    // 生成預覽標籤名
    const cleanLabel = label.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
    audioTagPreviewResult.textContent = cleanLabel;

    // 更新確認按鈕狀態
    if (confirmAudioTag) confirmAudioTag.disabled = false;
}

// 處理音頻標籤確認
async function handleAudioTagConfirm() {
    if (!audioTagLabel || !currentAudioUrl) {
        console.error('[VN面板] 音頻標籤確認失敗：缺少必要信息');
        return;
    }

    const label = audioTagLabel.value.trim();
    const category = currentAudioCategory || 'bgm';

    if (!label) {
        alert('請輸入標籤名稱');
        return;
    }

    try {
        // 創建音頻數據
        const audioData = {
            url: currentAudioUrl,
            name: currentAudioName,
            category: category,
            label: label,
            type: 'audio-url',
            timestamp: Date.now()
        };

        // console.log('[VN面板] 準備保存音頻數據:', audioData);

        // 這裡可以添加音頻數據保存邏輯
        // 類似圖片的保存方式，但針對音頻
        if (window.materialAudioManager) {
            await window.materialAudioManager.saveAudio(audioData);
        } else {
            // 暫時保存到localStorage作為備用
            const savedAudios = JSON.parse(localStorage.getItem('vn_saved_audios') || '[]');
            savedAudios.push(audioData);
            localStorage.setItem('vn_saved_audios', JSON.stringify(savedAudios));
        }

        // 關閉模態窗口
        closeAudioTagModal();

        // 顯示成功提示
        alert(`音頻已保存：${label}`);

        // console.log('[VN面板] 音頻標籤保存成功:', audioData);

    } catch (error) {
        console.error('[VN面板] 音頻標籤保存失敗:', error);
        alert('保存失敗：' + error.message);
    }
}

// 初始化音頻標籤模態窗口
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeAudioTagModal, 200);
});

// 提供全局函數
window.showAudioTagModal = showAudioTagModal;
window.closeAudioTagModal = closeAudioTagModal;

    
    // ========== 图片压缩修复代码 - 结束 ==========


            // console.log('[VN面板] 素材設置功能已初始化');

            // 延迟初始化圖片標籤輸入模態窗口，确保变量已声明
            setTimeout(() => {
                if (typeof initializeImageTagModal === 'function') {
            initializeImageTagModal();
                }
            }, 0);

        // 顯示劇情設置模態框
        function showStoryEditModal() {
            const modal = document.getElementById('storyEditModal');
            if (modal) {
                modal.classList.add('modal-active');
                // console.log('[VN面板] 顯示劇情設置模態框');
            }
        }

        // ======================================================================= 
        //                        全局变量初始化 - 图片上传相关
        // =======================================================================

        // 立即初始化上传相关的全局变量，避免初始化顺序问题
        (function() {
            'use strict';
    
            // 在 window 对象上初始化变量
            window.currentUploadFile = null;
            window.currentUploadCategory = null;
    
            // 确保局部变量也被声明 - 使用 window 对象避免变量初始化问题
            if (typeof window.currentUploadFile_local === 'undefined') {
                window.currentUploadFile_local = null;
                window.currentUploadCategory_local = null;
            }
    
            // console.log('[VN面板] 图片上传全局变量已初始化');
        })();



        // =======================================================================
        //                            圖片標籤輸入模態窗口功能
        // =======================================================================

        // 圖片標籤輸入模態窗口相關變數
        let imageTagModal = null;
        let imageTagPreview = null;
        let imageTagFileName = null;
        let imageTagFileSize = null;
        let imageTagCategory = null;
        let imageTagLabel = null;
        let imageTagEmotion = null;
        let emotionTagGroup = null;
        let tagHelpText = null;
        let tagPreviewResult = null;
        let confirmImageTag = null;
        let cancelImageTag = null;
        let closeImageTag = null;

        
        // 當前上傳的圖片文件
        window.currentUploadFile = null;
        window.currentUploadCategory = null;

        // 局部变量声明
        let currentUploadFile = null;
        let currentUploadCategory = null;






        // 立即初始化圖片標籤輸入模態窗口變數
        (function() {
            // 嘗試立即獲取DOM元素
            const modalElement = document.getElementById('imageTagModal');
            if (modalElement) {
                imageTagModal = modalElement;
                imageTagPreview = document.getElementById('imageTagPreview');
                imageTagFileName = document.getElementById('imageTagFileName');
                imageTagFileSize = document.getElementById('imageTagFileSize');
                imageTagCategory = document.getElementById('imageTagCategory');
                imageTagLabel = document.getElementById('imageTagLabel');
                imageTagEmotion = document.getElementById('imageTagEmotion');
                emotionTagGroup = document.getElementById('emotionTagGroup');
                tagHelpText = document.getElementById('tagHelpText');
                tagPreviewResult = document.getElementById('tagPreviewResult');
                confirmImageTag = document.getElementById('confirmImageTag');
                cancelImageTag = document.getElementById('cancelImageTag');
                closeImageTag = document.getElementById('closeImageTag');
                
                // console.log('[VN面板] 圖片標籤輸入模態窗口變數已預初始化');
            } else {
                console.warn('[VN面板] DOM元素未找到，將在DOMContentLoaded後重新初始化');
            }
        })();

        // 初始化圖片標籤輸入模態窗口
        function initializeImageTagModal() {
            // 如果已經初始化過，直接返回 - 使用 window 对象避免变量初始化问题
            if (window.imageTagModal && window.imageTagModal._initialized) {
                // console.log('[VN面板] 圖片標籤輸入模態窗口已經初始化過');
                return;
            }

            // 獲取DOM元素
            const modalElement = document.getElementById('imageTagModal');
            if (!modalElement) {
                console.error('[VN面板] 圖片標籤輸入模態窗口元素未找到');
                return;
            }

            // 初始化所有變數 - 使用 window 对象避免变量初始化问题
            window.imageTagModal = modalElement;
            window.imageTagPreview = document.getElementById('imageTagPreview');
            window.imageTagFileName = document.getElementById('imageTagFileName');
            window.imageTagFileSize = document.getElementById('imageTagFileSize');
            window.imageTagCategory = document.getElementById('imageTagCategory');
            window.imageTagLabel = document.getElementById('imageTagLabel');
            window.imageTagEmotion = document.getElementById('imageTagEmotion');
            window.emotionTagGroup = document.getElementById('emotionTagGroup');
            window.tagHelpText = document.getElementById('tagHelpText');
            window.tagPreviewResult = document.getElementById('tagPreviewResult');
            window.confirmImageTag = document.getElementById('confirmImageTag');
            window.cancelImageTag = document.getElementById('cancelImageTag');
            window.closeImageTag = document.getElementById('closeImageTag');

            // 檢查所有必要元素是否存在 - 使用 window 对象避免变量初始化问题
            const requiredElements = [
                { name: 'imageTagModal', element: window.imageTagModal },
                { name: 'imageTagPreview', element: window.imageTagPreview },
                { name: 'imageTagFileName', element: window.imageTagFileName },
                { name: 'imageTagFileSize', element: window.imageTagFileSize },
                { name: 'imageTagCategory', element: window.imageTagCategory },
                { name: 'imageTagLabel', element: window.imageTagLabel },
                { name: 'confirmImageTag', element: window.confirmImageTag },
                { name: 'cancelImageTag', element: window.cancelImageTag },
                { name: 'closeImageTag', element: window.closeImageTag }
            ];

            const missingElements = requiredElements.filter(item => !item.element);
            if (missingElements.length > 0) {
                console.error('[VN面板] 圖片標籤輸入模態窗口初始化失敗，缺少元素:', missingElements.map(item => item.name));
                return;
            }

            // 綁定事件監聽器
            setupImageTagEventListeners();
            
            // 標記為已初始化 - 使用 window 对象避免变量初始化问题
            window.imageTagModal._initialized = true;
            
            // console.log('[VN面板] 圖片標籤輸入模態窗口已初始化成功');
        }

        // 設置圖片標籤輸入模態窗口事件監聽器
        function setupImageTagEventListeners() {
            // 如果已經綁定過事件，先移除舊的事件監聽器
            if (imageTagModal && imageTagModal._eventsBound) {
                return;
            }

            // 關閉按鈕事件
            if (closeImageTag) {
                closeImageTag.removeEventListener('click', closeImageTagModal);
                closeImageTag.addEventListener('click', closeImageTagModal);
            }

            if (cancelImageTag) {
                cancelImageTag.removeEventListener('click', closeImageTagModal);
                cancelImageTag.addEventListener('click', closeImageTagModal);
            }

            // 確認按鈕事件
            if (confirmImageTag) {
                confirmImageTag.removeEventListener('click', handleImageTagConfirm);
                confirmImageTag.addEventListener('click', handleImageTagConfirm);
            }

            // 分類選擇事件 - 使用延迟执行避免变量初始化问题
            if (imageTagCategory) {
                imageTagCategory.removeEventListener('change', function() {
                    if (typeof handleCategoryChange === 'function') {
                        handleCategoryChange();
                    }
                });
                imageTagCategory.addEventListener('change', function() {
                    if (typeof handleCategoryChange === 'function') {
                        handleCategoryChange();
                    }
                });
            }

            // 標籤輸入事件 - 使用延迟执行避免变量初始化问题
            if (imageTagLabel) {
                imageTagLabel.removeEventListener('input', function() {
                    if (typeof updateTagPreview === 'function') {
                        updateTagPreview();
                    }
                });
                imageTagLabel.addEventListener('input', function() {
                    if (typeof updateTagPreview === 'function') {
                        updateTagPreview();
                    }
                });
            }

            if (imageTagEmotion) {
                imageTagEmotion.removeEventListener('input', function() {
                    if (typeof updateTagPreview === 'function') {
                        updateTagPreview();
                    }
                });
                imageTagEmotion.addEventListener('input', function() {
                    if (typeof updateTagPreview === 'function') {
                        updateTagPreview();
                    }
                });
            }

            // 點擊背景關閉
            if (imageTagModal) {
                imageTagModal.removeEventListener('click', imageTagModal._backgroundClickHandler);
                imageTagModal._backgroundClickHandler = function(e) {
                    if (e.target === imageTagModal) {
                        closeImageTagModal();
                    }
                };
                imageTagModal.addEventListener('click', imageTagModal._backgroundClickHandler);
            }

            // ESC鍵關閉
            document.removeEventListener('keydown', document._escapeKeyHandler);
            document._escapeKeyHandler = function(e) {
                if (e.key === 'Escape' && imageTagModal && imageTagModal.classList.contains('modal-active')) {
                    closeImageTagModal();
                }
            };
            document.addEventListener('keydown', document._escapeKeyHandler);

            // 標記為已綁定事件
            if (imageTagModal) {
                imageTagModal._eventsBound = true;
            }
        }

        // 顯示圖片標籤輸入模態窗口
// 显示图片标签输入模态窗口
function showImageTagModal(file, category) {
    if (!file) {
        console.error('[VN面板] 无法显示图片标签输入模态窗口：文件为空');
        return;
    }

    // 直接在函数内部获取DOM元素，避免全局变量初始化问题
    const modalElement = document.getElementById('imageTagModal');
    const previewElement = document.getElementById('imageTagPreview');
    const fileNameElement = document.getElementById('imageTagFileName');
    const fileSizeElement = document.getElementById('imageTagFileSize');
    const categoryElement = document.getElementById('imageTagCategory');
    const labelElement = document.getElementById('imageTagLabel');
    const emotionElement = document.getElementById('imageTagEmotion');
    const emotionGroupElement = document.getElementById('emotionTagGroup');
    const helpTextElement = document.getElementById('tagHelpText');
    const previewResultElement = document.getElementById('tagPreviewResult');
    const confirmElement = document.getElementById('confirmImageTag');

    if (!modalElement) {
        console.error('[VN面板] 图片标签输入模态窗口元素未找到');
        
        // 如果DOM还未加载完成，等待加载完成后重试
        if (document.readyState === 'loading') {
            // 防止重复添加事件监听器
            if (!window.domContentLoadedHandler) {
                window.domContentLoadedHandler = function() {
                setTimeout(() => {
                        if (typeof showImageTagModal === 'function') {
                    showImageTagModal(file, category);
                        }
                }, 200);
                };
                document.addEventListener('DOMContentLoaded', window.domContentLoadedHandler);
            }
            return;
        } else {
            alert('图片上传功能暂时不可用，请刷新页面后重试');
            return;
        }
    }

// 保存到全局变量，供后续处理使用
window.currentUploadFile = file;
window.currentUploadCategory = category;

// 同时也保存到局部变量作为备份
try {
    currentUploadFile = file;
    currentUploadCategory = category;
} catch (error) {
    console.debug('[VN面板] 保存到局部变量时发生错误（可忽略）:', error.message);
}

    // 檢查是否為URL類型圖片
    const isUrlImage = file.type === 'url' || file.url;
    
    if (isUrlImage) {
        // 處理URL類型圖片
        if (previewElement) {
            previewElement.src = file.url;
        }
        
        if (fileNameElement) {
            fileNameElement.textContent = file.name || 'URL圖片';
        }
        
        if (fileSizeElement) {
            fileSizeElement.textContent = 'URL圖片';
        }
    } else {
        // 處理文件類型圖片
        // 设置图片预览
        const reader = new FileReader();
        reader.onload = function(e) {
            if (previewElement) {
                previewElement.src = e.target.result;
            }
        };
        reader.readAsDataURL(file);

        // 设置文件信息
        if (fileNameElement) {
            fileNameElement.textContent = file.name;
        }

        if (fileSizeElement) {
            const sizeInKB = (file.size / 1024).toFixed(1);
            fileSizeElement.textContent = `${sizeInKB} KB`;
        }
    }

    // 设置分类
    if (categoryElement) {
        categoryElement.value = category || 'portrait';
        // 手动触发分类变更事件
        handleCategoryChangeLocal(categoryElement.value, emotionGroupElement, helpTextElement);
    }

    // 清空标签输入
    if (labelElement) {
        labelElement.value = '';
    }

    if (emotionElement) {
        emotionElement.value = '';
    }

    // 更新预览
    updateTagPreviewLocal(categoryElement, labelElement, emotionElement, previewResultElement, confirmElement);

    // 设置局部事件监听器（而不是调用全局的setupImageTagEventListeners）
    setupLocalEventListeners(modalElement, confirmElement, categoryElement, labelElement, emotionElement);

    // 显示模态窗口
    modalElement.classList.add('modal-active');

     console.log('[VN面板] 显示图片标签输入模态窗口:', {
        fileName: file.name,
        fileSize: file.size,
        category: category
    });
    
    // 防止重复显示模态窗口
    if (window.currentModalFile && window.currentModalFile.name === file.name && window.currentModalFile.size === file.size) {
        // console.log('[VN面板] 检测到重复文件，跳过重复显示');
        return;
    }
    window.currentModalFile = file;
}

// 设置局部事件监听器的函数
function setupLocalEventListeners(modalElement, confirmElement, categoryElement, labelElement, emotionElement) {
    // 如果已经绑定过事件，避免重复绑定
    if (modalElement._localEventsBound) {
         console.log('[VN面板] 事件监听器已经绑定过，跳过重复绑定');
        return;
    }

    // 确认按钮事件
    if (confirmElement) {
        const confirmHandler = function() {
            handleImageTagConfirm();
        };
        confirmElement.removeEventListener('click', confirmHandler);
        confirmElement.addEventListener('click', confirmHandler);
    }

    // 分类选择事件
    if (categoryElement) {
        const categoryHandler = function() {
            const emotionGroupElement = document.getElementById('emotionTagGroup');
            const helpTextElement = document.getElementById('tagHelpText');
            handleCategoryChangeLocal(categoryElement.value, emotionGroupElement, helpTextElement);
        };
        categoryElement.removeEventListener('change', categoryHandler);
        categoryElement.addEventListener('change', categoryHandler);
    }

    // 标签输入事件
    if (labelElement) {
        const labelHandler = function() {
            const previewResultElement = document.getElementById('tagPreviewResult');
            const confirmEl = document.getElementById('confirmImageTag');
            const categoryEl = document.getElementById('imageTagCategory');
            const emotionEl = document.getElementById('imageTagEmotion');
            updateTagPreviewLocal(categoryEl, labelElement, emotionEl, previewResultElement, confirmEl);
        };
        labelElement.removeEventListener('input', labelHandler);
        labelElement.addEventListener('input', labelHandler);
    }

    if (emotionElement) {
        const emotionHandler = function() {
            const previewResultElement = document.getElementById('tagPreviewResult');
            const confirmEl = document.getElementById('confirmImageTag');
            const categoryEl = document.getElementById('imageTagCategory');
            updateTagPreviewLocal(categoryEl, labelElement, emotionElement, previewResultElement, confirmEl);
        };
        emotionElement.removeEventListener('input', emotionHandler);
        emotionElement.addEventListener('input', emotionHandler);
    }

    // 关闭按钮事件
    const closeButtons = document.querySelectorAll('#closeImageTag, #cancelImageTag');
    closeButtons.forEach(button => {
        if (button) {
            const closeHandler = function() {
                closeImageTagModal();
            };
            button.removeEventListener('click', closeHandler);
            button.addEventListener('click', closeHandler);
        }
    });

    // 点击背景关闭
    const backgroundClickHandler = function(e) {
        if (e.target === modalElement) {
            closeImageTagModal();
        }
    };
    modalElement.removeEventListener('click', backgroundClickHandler);
    modalElement.addEventListener('click', backgroundClickHandler);

    // ESC键关闭
    const escapeHandler = function(e) {
        if (e.key === 'Escape' && modalElement.classList.contains('modal-active')) {
            closeImageTagModal();
        }
    };
    document.removeEventListener('keydown', escapeHandler);
    document.addEventListener('keydown', escapeHandler);

    // 标记为已绑定事件
    modalElement._localEventsBound = true;
}

// 本地处理分类变更的函数
function handleCategoryChangeLocal(category, emotionGroupElement, helpTextElement) {
    const isCharacterImg = category === 'character-img';

    // 显示/隐藏表情输入框
    if (emotionGroupElement) {
        emotionGroupElement.style.display = isCharacterImg ? 'block' : 'none';
    }

    // 更新帮助文字
    if (helpTextElement) {
        const helpTexts = {
            'portrait': '輸入角色名稱，圖片將命名為：角色名_presets.png',
            'character-img': '輸入角色名稱，圖片將命名為：角色名_表情.png',
            'background': '輸入地點名稱，圖片將命名為：地點名.jpeg',
            'sticker': '輸入貼圖名稱，圖片將命名為：貼圖名.jpg',
            'item-img': '輸入物品名稱，圖片將命名為：物品名.png',
            'item-type': '輸入物品類型名稱，圖片將命名為：類型名.png'
        };
        helpTextElement.textContent = helpTexts[category] || '請輸入標籤名稱';
    }
}

// 本地更新标签预览的函数
function updateTagPreviewLocal(categoryElement, labelElement, emotionElement, previewResultElement, confirmElement) {
    if (!previewResultElement) return;

    const category = categoryElement ? categoryElement.value : '';
    const label = labelElement ? labelElement.value.trim() : '';
    const emotion = emotionElement ? emotionElement.value.trim() : '';

    if (!label) {
        previewResultElement.textContent = '未設置標籤';
        if (confirmElement) confirmElement.disabled = true;
        return;
    }

    // 生成预览文件名
    const previewFileName = generatePreviewFileNameLocal(category, label, emotion);
    previewResultElement.textContent = previewFileName;

    // 更新确认按钮状态
    if (confirmElement) confirmElement.disabled = false;
}

// 本地生成预览文件名的函数
function generatePreviewFileNameLocal(category, label, emotion = '') {
    const cleanLabel = label.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
    const cleanEmotion = emotion.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');

    const fileExtensions = {
        'portrait': '.png',
        'character-img': '.png',
        'background': '.jpeg',
        'sticker': '.jpg',
        'item-img': '.png',
        'item-type': '.png'
    };

    const extension = fileExtensions[category] || '.png';

    switch (category) {
        case 'portrait':
            return `${cleanLabel}_presets${extension}`;
        case 'character-img':
            return cleanEmotion ? `${cleanLabel}_${cleanEmotion}${extension}` : `${cleanLabel}${extension}`;
        case 'background':
        case 'sticker':
        case 'item-img':
        case 'item-type':
            return `${cleanLabel}${extension}`;
        default:
            return `${cleanLabel}${extension}`;
    }
}


// 關閉圖片標籤輸入模態窗口
function closeImageTagModal() {
    const modalElement = document.getElementById('imageTagModal');
    if (!modalElement) {
        console.warn('[VN面板] 圖片標籤模態窗口元素未找到');
        return;
    }

    modalElement.classList.remove('modal-active');
    
    // 使用 window 对象来安全清空当前文件，避免变量初始化问题
    try {
        if (typeof window.currentUploadFile !== 'undefined') {
            window.currentUploadFile = null;
        }
        if (typeof window.currentUploadCategory !== 'undefined') {
            window.currentUploadCategory = null;
        }
        
        // 也清空局部变量（如果存在的话）
        if (typeof currentUploadFile !== 'undefined') {
            currentUploadFile = null;
        }
        if (typeof currentUploadCategory !== 'undefined') {
            currentUploadCategory = null;
        }
    } catch (error) {
        // 忽略变量访问错误，只记录日志
        console.debug('[VN面板] 清空上传文件变量时发生错误（可忽略）:', error.message);
    }

    // 清理当前模态窗口文件标志
    window.currentModalFile = null;

    // console.log('[VN面板] 關閉圖片標籤輸入模態窗口');
}


        // 處理分類變更
        function handleCategoryChange() {
            if (!imageTagCategory || !emotionTagGroup || !tagHelpText) return;

            const category = imageTagCategory.value;
            const isCharacterImg = category === 'character-img';

            // 顯示/隱藏表情輸入框
            emotionTagGroup.style.display = isCharacterImg ? 'block' : 'none';

            // 更新幫助文字 - 使用延迟执行避免函数初始化问题
            if (typeof updateHelpText === 'function') {
            updateHelpText(category);
            }

            // 更新預覽 - 使用延迟执行避免函数初始化问题
            if (typeof updateTagPreview === 'function') {
            updateTagPreview();
            }
        }

        // 更新幫助文字
        function updateHelpText(category) {
            if (!tagHelpText) return;

            const helpTexts = {
                'portrait': '輸入角色名稱，圖片將命名為：角色名_presets.png',
                'character-img': '輸入角色名稱，圖片將命名為：角色名_表情.png',
                'background': '輸入地點名稱，圖片將命名為：地點名.jpeg',
                'sticker': '輸入貼圖名稱，圖片將命名為：貼圖名.jpg',
                'item-img': '輸入物品名稱，圖片將命名為：物品名.png',
                'item-type': '輸入物品類型名稱，圖片將命名為：類型名.png'
            };

            tagHelpText.textContent = helpTexts[category] || '請輸入標籤名稱';
        }

        // 更新標籤預覽
        function updateTagPreview() {
            if (!tagPreviewResult || !imageTagCategory || !imageTagLabel) return;

            const category = imageTagCategory.value;
            const label = imageTagLabel.value.trim();
            const emotion = imageTagEmotion ? imageTagEmotion.value.trim() : '';

            if (!label) {
                tagPreviewResult.textContent = '未設置標籤';
                // 更新確認按鈕狀態 - 使用延迟执行避免函数初始化问题
                if (typeof updateConfirmButton === 'function') {
                updateConfirmButton(false);
                }
                return;
            }

            // 生成預覽文件名 - 使用延迟执行避免函数初始化问题
            let previewFileName = '';
            if (typeof generatePreviewFileName === 'function') {
                previewFileName = generatePreviewFileName(category, label, emotion);
            } else {
                // 备用方案：简单的文件名生成
                const cleanLabel = label.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const cleanEmotion = emotion.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                const extension = category === 'background' ? '.jpeg' : '.png';
                previewFileName = cleanEmotion ? `${cleanLabel}_${cleanEmotion}${extension}` : `${cleanLabel}${extension}`;
            }
            tagPreviewResult.textContent = previewFileName;

            // 更新確認按鈕狀態 - 使用延迟执行避免函数初始化问题
            if (typeof updateConfirmButton === 'function') {
            updateConfirmButton(true);
            }
        }

        // 生成预览文件名的函数
function generatePreviewFileName(category, label, emotion = '') {
    const cleanLabel = label.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
    const cleanEmotion = emotion.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');

    const fileExtensions = {
        'portrait': '.png',
        'character-img': '.png',
        'background': '.jpeg',
        'sticker': '.jpg',
        'item-img': '.png',
        'item-type': '.png'
    };

    const extension = fileExtensions[category] || '.png';

    switch (category) {
        case 'portrait':
            return `${cleanLabel}_presets${extension}`;
        case 'character-img':
            return cleanEmotion ? `${cleanLabel}_${cleanEmotion}${extension}` : `${cleanLabel}${extension}`;
        case 'background':
        case 'sticker':
        case 'item-img':
        case 'item-type':
            return `${cleanLabel}${extension}`;
        default:
            return `${cleanLabel}${extension}`;
    }
}

        // 更新確認按鈕狀態
        function updateConfirmButton(enabled) {
            if (!confirmImageTag) return;

            confirmImageTag.disabled = !enabled;
        }


// 處理圖片標籤確認
async function handleImageTagConfirm() {
    // console.log('[VN面板] 开始处理图片标签确认');
    
    // 防止重复提交
    if (window.isProcessingImageTag) {
        // console.log('[VN面板] 正在处理中，跳过重复提交');
        return;
    }
    window.isProcessingImageTag = true;
    
    try {
        // 从 window 对象获取当前上传文件信息，避免变量初始化问题
        const uploadFile = window.currentUploadFile;
        const uploadCategory = window.currentUploadCategory;
        
        if (!uploadFile) {
            console.error('[VN面板] 圖片標籤確認失敗：沒有可用的上傳文件');
            // 顯示錯誤提示 - 使用延迟执行避免函数初始化问题
            if (typeof showImageTagError === 'function') {
            showImageTagError('沒有可用的上傳文件');
            } else {
                alert('沒有可用的上傳文件');
            }
            return;
        }

        // 获取当前的标签信息
        const categoryElement = document.getElementById('imageTagCategory');
        const labelElement = document.getElementById('imageTagLabel');
        const emotionElement = document.getElementById('imageTagEmotion');

        const category = categoryElement ? categoryElement.value : (uploadCategory || 'portrait');
        const label = labelElement ? labelElement.value.trim() : '';
        const emotion = emotionElement ? emotionElement.value.trim() : '';

        if (!label) {
            console.error('[VN面板] 標籤確認失敗：標籤不能為空');
            // 顯示錯誤提示 - 使用延迟执行避免函数初始化问题
            if (typeof showImageTagError === 'function') {
            showImageTagError('請輸入標籤名稱');
            } else {
                alert('請輸入標籤名稱');
            }
            return;
        }

        // 生成最終文件名 - 使用延迟执行避免函数初始化问题
        let fileName = '';
        if (typeof generatePreviewFileName === 'function') {
            fileName = generatePreviewFileName(category, label, emotion);
        } else {
            // 备用方案：简单的文件名生成
            const cleanLabel = label.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
            const cleanEmotion = emotion.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
            const extension = category === 'background' ? '.jpeg' : '.png';
            fileName = cleanEmotion ? `${cleanLabel}_${cleanEmotion}${extension}` : `${cleanLabel}${extension}`;
        }
        
        // 檢查是否為URL類型圖片
        const isUrlImage = uploadFile.type === 'url' || uploadFile.url;
        
        // 創建帶標籤的圖片數據
        const imageData = isUrlImage ? {
            url: uploadFile.url,
            name: fileName, // 使用生成的文件名而不是原始名称
            category: category,
            tag: label,
            emotion: emotion,
            type: 'url',
            timestamp: Date.now()
        } : {
            file: uploadFile,
            category: category,
            label: label,
            emotion: emotion,
            fileName: fileName,
            timestamp: Date.now()
        };

        // console.log('[VN面板] 準備保存圖片數據:', imageData);

        // 保存圖片到管理器
        if (window.materialImageManager) {
            await window.materialImageManager.uploadImageWithTag(imageData);
            // console.log('[VN面板] 圖片標籤保存成功:', imageData);
        } else {
            console.error('[VN面板] 圖片管理器未初始化');
            // 顯示錯誤提示 - 使用延迟执行避免函数初始化问题
            if (typeof showImageTagError === 'function') {
            showImageTagError('圖片管理器未初始化');
            } else {
                alert('圖片管理器未初始化');
            }
            return;
        }

        // 關閉模態窗口 - 使用延迟执行避免函数初始化问题
        if (typeof closeImageTagModal === 'function') {
        closeImageTagModal();
        }

        // 顯示成功提示 - 使用延迟执行避免函数初始化问题
        if (typeof showImageTagSuccess === 'function') {
        showImageTagSuccess(fileName);
        }

        // 刷新圖片列表
        if (window.loadUploadedImages) {
            await window.loadUploadedImages();
        }

        // 清空全局變量
        window.currentUploadFile = null;
        window.currentUploadCategory = null;

    } catch (error) {
        console.error('[VN面板] 圖片標籤保存失敗:', error);
        // 顯示錯誤提示 - 使用延迟执行避免函数初始化问题
        if (typeof showImageTagError === 'function') {
        showImageTagError('保存失敗：' + error.message);
        } else {
            alert('保存失敗：' + error.message);
        }
    } finally {
        // 重置处理标志
        window.isProcessingImageTag = false;
        // console.log('[VN面板] 图片标签确认处理完成');
    }
}

        // 顯示成功提示
        function showImageTagSuccess(fileName) {
            if (window.showCustomAlert) {
                window.showCustomAlert('上傳成功', `圖片已保存為：${fileName}`);
            } else {
                alert(`圖片上傳成功：${fileName}`);
            }
        }

        // 顯示錯誤提示
        function showImageTagError(message) {
            if (window.showCustomAlert) {
                window.showCustomAlert('上傳失敗', message);
            } else {
                alert('上傳失敗：' + message);
            }
        }

        // 刷新圖片列表
        function refreshImageList(category) {
            if (window.loadUploadedImages) {
                window.loadUploadedImages();
            }
        }

        // 提供全局函數供其他模塊調用
        window.showImageTagModal = showImageTagModal;
        window.closeImageTagModal = closeImageTagModal;
        window.refreshImageList = refreshImageList;

        // 在DOM加載完成後立即初始化圖片標籤輸入模態窗口
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(initializeImageTagModal, 100);
            });
        } else {
            setTimeout(initializeImageTagModal, 100);
        }

        // 添加调试工具到全局
        window.debugMaterialImageManager = async function() {
            // console.log('=== 素材圖片管理器調試信息 ===');
            
            if (!window.materialImageManager) {
                console.error('materialImageManager 未初始化');
                return;
            }
            
             console.log('IndexedDB 狀態:', {
                dbName: window.materialImageManager.dbName,
                dbVersion: window.materialImageManager.dbVersion,
                isInitialized: window.materialImageManager.isInitialized,
                hasDB: !!window.materialImageManager.db
            });
            
            try {
                // 检查所有分类的图片数量
                const categories = ['portrait', 'character-img', 'background', 'sticker', 'item-img', 'item-type'];
                for (const category of categories) {
                    const images = await window.materialImageManager.getImagesByCategory(category);
                    // console.log(`${category} 分類: ${images.length} 張圖片`);
                    
                    if (images.length > 0) {
                        images.forEach((img, index) => {
                            // console.log(`  ${index + 1}. ${img.name} (ID: ${img.id}, 類型: ${img.type}, 大小: ${img.size} bytes)`);
                        });
                    }
                }
                
                // 检查localStorage中的设置
                const settings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
                // console.log('localStorage 設置:', settings);
                
            } catch (error) {
                console.error('調試過程中發生錯誤:', error);
            }
        };
        
        // 在控制台输出调试命令提示
        // console.log('[VN面板] 調試命令: window.debugMaterialImageManager()');
        
        // 添加测试上传函数
        window.testImageUpload = async function() {
            // console.log('=== 測試圖片上傳功能 ===');
            
            if (!window.materialImageManager) {
                console.error('materialImageManager 未初始化');
                return;
            }
            
            try {
                // 创建一个测试图片数据
                const canvas = document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 100;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'red';
                ctx.fillRect(0, 0, 100, 100);
                ctx.fillStyle = 'white';
                ctx.font = '20px Arial';
                ctx.fillText('TEST', 20, 50);
                
                // 转换为Blob
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const testFile = new File([blob], 'test_image.png', { type: 'image/png' });
                
                // console.log('創建測試圖片:', testFile.name, testFile.size, 'bytes');
                
                // 上传测试图片
                const result = await window.materialImageManager.uploadImage(testFile, 'portrait');
                // console.log('測試圖片上傳結果:', result);
                
                // 验证是否保存成功
                const images = await window.materialImageManager.getImagesByCategory('portrait');
                // console.log('portrait分類圖片數量:', images.length);
                
                if (images.length > 0) {
                    // console.log('✅ 測試成功：圖片已保存到IndexedDB');
                } else {
                    // console.log('❌ 測試失敗：圖片未保存到IndexedDB');
                }
                
            } catch (error) {
                console.error('測試過程中發生錯誤:', error);
            }
        };
        
        // console.log('[VN面板] 測試命令: window.testImageUpload()');