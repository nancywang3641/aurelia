/**
 * 素材設置管理模組 v2.0 - 清理版
 * 
 * 功能：
 * - 只负责素材设置UI的事件绑定和表单管理
 * - 图片上传和管理功能已迁移到 material-window.js
 * - 与现有音频系统整合
 */

// =======================================================================
//                            素材設置配置
// =======================================================================

// 預設素材URL配置
const DEFAULT_MATERIAL_CONFIG = {
    // 立繪預設
    characterArt: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/char_presets/',
        format: '_presets.png'
    },
    // 表情立繪
    expressionArt: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/expressions/',
        format: '_happy.png'
    },
    // BGM
    bgm: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/bgm/',
        format: '.mp3'
    },
    // 音效
    soundEffect: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/sound_effect/',
        format: '.mp3'
    },
    // 背景
    background: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/location_img/',
        format: '.jpeg'
    },
    // 貼圖
    sticker: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/stickers/',
        format: '.png'
    },
    // Area GIF
    areaGif: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/area_gifs/',
        format: '.gif'
    },
    // 物品圖片
    itemImage: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/items/',
        format: '.png'
    },
    // 物品類型
    itemType: {
        baseUrl: 'https://nancywang3641.github.io/sound-files/item_types/',
        format: '.png'
    }
};

// 當前素材配置
let currentMaterialConfig = {};

// =======================================================================
//                            本地存儲管理
// =======================================================================

function loadMaterialConfig() {
    try {
        const saved = localStorage.getItem('vn_material_config');
        if (saved) {
            currentMaterialConfig = JSON.parse(saved);
            // console.log('[素材設置] 已載入本地配置');
        } else {
            currentMaterialConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIAL_CONFIG));
            // console.log('[素材設置] 使用預設配置');
        }
    } catch (error) {
        console.error('[素材設置] 載入配置失敗:', error);
        currentMaterialConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIAL_CONFIG));
    }
}

function saveMaterialConfig() {
    try {
        localStorage.setItem('vn_material_config', JSON.stringify(currentMaterialConfig));
        // console.log('[素材設置] 配置已保存到本地存儲');
        return true;
    } catch (error) {
        console.error('[素材設置] 保存配置失敗:', error);
        return false;
    }
}

// =======================================================================
//                            UI控制功能
// =======================================================================

function initMaterialSettingsUI() {
    // 載入配置
    loadMaterialConfig();
    
    // 填充表單
    populateMaterialForm();
    
    // 綁定事件
    bindMaterialSettingsEvents();
    
    // 初始化摺疊狀態
    initCollapsedSections();
    
    // 初始化全局模式開關（必須在模式狀態之前）
    initGlobalModeSwitch();
    
    // 初始化模式狀態
    initModeStates();
    
    // 綁定上傳事件
    bindUploadEvents();
    
    // 图片列表初始化已由 material-window.js 的 loadUploadedImages() 处理
    
    // 確保DOM完全加載後再次應用全局模式
    setTimeout(() => {
        // console.log('[素材設置] 延遲應用全局模式以確保DOM同步');
        applyGlobalMode();
        checkAndFixUISync();
    }, 100);
    
    // console.log('[素材設置] UI初始化完成');
}

function populateMaterialForm() {
    // 填充立繪設置
    const portraitBaseUrl = document.getElementById('portraitBaseUrl');
    const portraitFormat = document.getElementById('portraitFormat');
    if (portraitBaseUrl && portraitFormat) {
        portraitBaseUrl.value = currentMaterialConfig.characterArt?.baseUrl || '';
        portraitFormat.value = currentMaterialConfig.characterArt?.format || '';
    }

    // 填充表情設置
    const expressionBaseUrl = document.getElementById('expressionBaseUrl');
    const expressionFormat = document.getElementById('expressionFormat');
    if (expressionBaseUrl && expressionFormat) {
        expressionBaseUrl.value = currentMaterialConfig.expressionArt?.baseUrl || '';
        expressionFormat.value = currentMaterialConfig.expressionArt?.format || '';
    }

    // 填充BGM設置
    const bgmBaseUrl = document.getElementById('bgmBaseUrl');
    const bgmFormat = document.getElementById('bgmFormat');
    if (bgmBaseUrl && bgmFormat) {
        bgmBaseUrl.value = currentMaterialConfig.bgm?.baseUrl || '';
        bgmFormat.value = currentMaterialConfig.bgm?.format || '';
    }

    // 填充音效設置
    const soundEffectBaseUrl = document.getElementById('soundEffectBaseUrl');
    const soundEffectFormat = document.getElementById('soundEffectFormat');
    if (soundEffectBaseUrl && soundEffectFormat) {
        soundEffectBaseUrl.value = currentMaterialConfig.soundEffect?.baseUrl || '';
        soundEffectFormat.value = currentMaterialConfig.soundEffect?.format || '';
    }

    // 填充背景設置
    const backgroundBaseUrl = document.getElementById('backgroundBaseUrl');
    const backgroundFormat = document.getElementById('backgroundFormat');
    if (backgroundBaseUrl && backgroundFormat) {
        backgroundBaseUrl.value = currentMaterialConfig.background?.baseUrl || '';
        backgroundFormat.value = currentMaterialConfig.background?.format || '';
    }

    // 填充貼圖設置
    const stickerBaseUrl = document.getElementById('stickerBaseUrl');
    const stickerFormat = document.getElementById('stickerFormat');
    if (stickerBaseUrl && stickerFormat) {
        stickerBaseUrl.value = currentMaterialConfig.sticker?.baseUrl || '';
        stickerFormat.value = currentMaterialConfig.sticker?.format || '';
    }

    // 填充Area GIF設置
    const areaGifBaseUrl = document.getElementById('areaGifBaseUrl');
    const areaGifFormat = document.getElementById('areaGifFormat');
    if (areaGifBaseUrl && areaGifFormat) {
        areaGifBaseUrl.value = currentMaterialConfig.areaGif?.baseUrl || '';
        areaGifFormat.value = currentMaterialConfig.areaGif?.format || '';
    }

    // 填充物品圖片設置
    const itemImageBaseUrl = document.getElementById('itemImageBaseUrl');
    const itemImageFormat = document.getElementById('itemImageFormat');
    if (itemImageBaseUrl && itemImageFormat) {
        itemImageBaseUrl.value = currentMaterialConfig.itemImage?.baseUrl || '';
        itemImageFormat.value = currentMaterialConfig.itemImage?.format || '';
    }

    // 填充物品類型設置
    const itemTypeBaseUrl = document.getElementById('itemTypeBaseUrl');
    const itemTypeFormat = document.getElementById('itemTypeFormat');
    if (itemTypeBaseUrl && itemTypeFormat) {
        itemTypeBaseUrl.value = currentMaterialConfig.itemType?.baseUrl || '';
        itemTypeFormat.value = currentMaterialConfig.itemType?.format || '';
    }
}

function bindMaterialSettingsEvents() {
    // 素材設置按鈕
    const materialSettingsBtn = document.getElementById('materialSettingsBtn');
    if (materialSettingsBtn) {
        materialSettingsBtn.addEventListener('click', function() {
            // console.log('[素材設置] 打開素材設置窗口');
            const modal = document.getElementById('materialSettingsModal');
            modal.style.display = 'flex';
            
            // 🚀 新增：通知父窗口展開iframe尺寸（類似開始劇情的效果）
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'VN_IFRAME_RESIZE',
                        state: 'story',
                        source: 'VN_PANEL_MATERIAL_SETTINGS',
                        timestamp: Date.now()
                    }, '*');
                    // console.log('[素材設置] 已通知父窗口展開iframe尺寸');
                }
            } catch (error) {
                console.error('[素材設置] 通知父窗口展開iframe失敗:', error);
            }
            
            // 確保打開時UI與全局模式同步
            setTimeout(() => {
                // console.log('[素材設置] 模態窗口打開後同步UI');
                checkAndFixUISync();
            }, 50);
            
            // 播放音效
            if (window.VNFeatures?.playSound) {
                window.VNFeatures.playSound('clickSound');
            }
        });
    }
    
    // 關閉按鈕
    const closeMaterialSettings = document.querySelector('.close-material-settings');
    if (closeMaterialSettings) {
        closeMaterialSettings.addEventListener('click', function() {
            const modal = document.getElementById('materialSettingsModal');
            modal.style.display = 'none';
            
            // 🚀 新增：通知父窗口恢復iframe尺寸
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'VN_IFRAME_RESIZE',
                        state: 'landing',
                        source: 'VN_PANEL_MATERIAL_SETTINGS_CLOSE',
                        timestamp: Date.now()
                    }, '*');
                    // console.log('[素材設置] 已通知父窗口恢復iframe尺寸');
                }
            } catch (error) {
                console.error('[素材設置] 通知父窗口恢復iframe失敗:', error);
            }
        });
    }
    
    // 點擊模態窗口背景關閉
    const materialSettingsModal = document.getElementById('materialSettingsModal');
    if (materialSettingsModal) {
        materialSettingsModal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
                
                // 🚀 新增：通知父窗口恢復iframe尺寸
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'VN_IFRAME_RESIZE',
                            state: 'landing',
                            source: 'VN_PANEL_MATERIAL_SETTINGS_CLOSE',
                            timestamp: Date.now()
                        }, '*');
                        // console.log('[素材設置] 已通知父窗口恢復iframe尺寸（背景點擊）');
                    }
                } catch (error) {
                    console.error('[素材設置] 通知父窗口恢復iframe失敗:', error);
                }
            }
        });
    }
    
    // 保存設置
    const saveMaterialSettings = document.getElementById('saveMaterialSettings');
    if (saveMaterialSettings) {
        saveMaterialSettings.addEventListener('click', function() {
            saveMaterialSettingsFromForm();
        });
    }
    
    // 重置設置
    const resetMaterialSettings = document.getElementById('resetMaterialSettings');
    if (resetMaterialSettings) {
        resetMaterialSettings.addEventListener('click', function() {
            resetMaterialSettingsToDefault();
        });
    }
    
    // 背景API設置事件綁定
    bindBackgroundAPIEvents();
}

// =======================================================================
//                            表单保存和重置
// =======================================================================

function saveMaterialSettingsFromForm() {
    try {
        // 收集表單數據
        const newConfig = {
            characterArt: {
                baseUrl: document.getElementById('portraitBaseUrl')?.value || '',
                format: document.getElementById('portraitFormat')?.value || ''
            },
            expressionArt: {
                baseUrl: document.getElementById('expressionBaseUrl')?.value || '',
                format: document.getElementById('expressionFormat')?.value || ''
            },
            bgm: {
                baseUrl: document.getElementById('bgmBaseUrl')?.value || '',
                format: document.getElementById('bgmFormat')?.value || ''
            },
            soundEffect: {
                baseUrl: document.getElementById('soundEffectBaseUrl')?.value || '',
                format: document.getElementById('soundEffectFormat')?.value || ''
            },
            background: {
                baseUrl: document.getElementById('backgroundBaseUrl')?.value || '',
                format: document.getElementById('backgroundFormat')?.value || ''
            },
            sticker: {
                baseUrl: document.getElementById('stickerBaseUrl')?.value || '',
                format: document.getElementById('stickerFormat')?.value || ''
            },
            areaGif: {
                baseUrl: document.getElementById('areaGifBaseUrl')?.value || '',
                format: document.getElementById('areaGifFormat')?.value || ''
            },
            itemImage: {
                baseUrl: document.getElementById('itemImageBaseUrl')?.value || '',
                format: document.getElementById('itemImageFormat')?.value || ''
            },
            itemType: {
                baseUrl: document.getElementById('itemTypeBaseUrl')?.value || '',
                format: document.getElementById('itemTypeFormat')?.value || ''
            }
        };

        currentMaterialConfig = newConfig;
        
        if (saveMaterialConfig()) {
            alert('素材設置保存成功！');
            
            // 關閉模態窗口
            const modal = document.getElementById('materialSettingsModal');
            if (modal) {
                modal.style.display = 'none';
            }
        } else {
            alert('保存失敗，請重試');
        }
        
    } catch (error) {
        console.error('[素材設置] 保存表單失敗:', error);
        alert('保存失敗：' + error.message);
    }
}

function resetMaterialSettingsToDefault() {
    if (!confirm('確定要重置為預設設置嗎？這將覆蓋當前所有設置。')) {
        return;
    }
    
    try {
        // 重置為預設配置
        currentMaterialConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIAL_CONFIG));
        
        // 重新填充表單
        populateMaterialForm();
        
        // 保存配置
        if (saveMaterialConfig()) {
            alert('已重置為預設設置！');
        }
        
    } catch (error) {
        console.error('[素材設置] 重置失敗:', error);
        alert('重置失敗：' + error.message);
    }
}

// =======================================================================
//                            上传事件绑定 (委托给 material-window.js)
// =======================================================================

function bindUploadEvents() {
    // console.log('[素材設置] 上传事件绑定已由 material-window.js 处理');
    // 上传功能已完全迁移到 material-window.js
    // 这里只保留事件绑定的占位符以维持兼容性
}

// =======================================================================
//                            全局模式管理
// =======================================================================

// 摺疊狀態管理
const collapsedSections = new Set();

function initCollapsedSections() {
    try {
        const saved = localStorage.getItem('vn_material_collapsed_sections');
        if (saved) {
            const sections = JSON.parse(saved);
            sections.forEach(section => collapsedSections.add(section));
            
            // 應用摺疊狀態
            sections.forEach(sectionId => {
                const content = document.getElementById(`${sectionId}-content`);
                const toggle = content?.previousElementSibling?.querySelector('.material-section-toggle');
                if (content && toggle) {
                    content.classList.add('collapsed');
                    toggle.textContent = '▶';
                }
            });
        }
    } catch (error) {
        console.error('[素材設置] 載入摺疊狀態失敗:', error);
    }
}

function saveCollapsedSections() {
    try {
        localStorage.setItem('vn_material_collapsed_sections', JSON.stringify([...collapsedSections]));
    } catch (error) {
        console.error('[素材設置] 保存摺疊狀態失敗:', error);
    }
}

function toggleMaterialSection(sectionId) {
    const content = document.getElementById(`${sectionId}-content`);
    const toggle = content.previousElementSibling.querySelector('.material-section-toggle');
    
    if (collapsedSections.has(sectionId)) {
        // 展開
        content.classList.remove('collapsed');
        toggle.textContent = '▼';
        collapsedSections.delete(sectionId);
    } else {
        // 摺疊
        content.classList.add('collapsed');
        toggle.textContent = '▶';
        collapsedSections.add(sectionId);
    }
    
    saveCollapsedSections();
}

// 全局模式管理（与 material-window.js 协调）
function initGlobalModeSwitch() {
    // console.log('[素材設置] 全局模式开关已由 material-window.js 统一管理');
}

function initModeStates() {
    // console.log('[素材設置] 模式状态已由 material-window.js 统一管理');
}

function applyGlobalMode() {
    // console.log('[素材設置] 全局模式应用已由 material-window.js 统一处理');
}

function checkAndFixUISync() {
    // console.log('[素材設置] UI同步检查已由 material-window.js 统一处理');
}

// =======================================================================
//                            背景API設置管理
// =======================================================================

function bindBackgroundAPIEvents() {
    try {
        // 載入背景API設置
        loadBackgroundAPISettings();
        
        // 啟用/禁用切換
        const backgroundApiEnabled = document.getElementById('background-api-enabled');
        if (backgroundApiEnabled) {
            backgroundApiEnabled.addEventListener('change', function() {
                const isEnabled = this.checked;
                if (window.vnBackgroundGenerator) {
                    window.vnBackgroundGenerator.updateSettings({ isEnabled });
                }
                // console.log('[背景API設置] 啟用狀態已更新:', isEnabled);
            });
        }
        
        // 模型選擇
        const backgroundModelSelect = document.getElementById('background-model-select');
        if (backgroundModelSelect) {
            backgroundModelSelect.addEventListener('change', function() {
                const model = this.value;
                if (window.vnBackgroundGenerator) {
                    window.vnBackgroundGenerator.updateSettings({ currentModel: model });
                }
                // console.log('[背景API設置] 模型已更新:', model);
            });
        }
        
        // 尺寸選擇
        const backgroundSizeSelect = document.getElementById('background-size-select');
        if (backgroundSizeSelect) {
            backgroundSizeSelect.addEventListener('change', function() {
                const size = this.value;
                if (window.vnBackgroundGenerator) {
                    window.vnBackgroundGenerator.updateSettings({ currentSize: size });
                }
                // console.log('[背景API設置] 尺寸已更新:', size);
            });
        }
        
        // 品質選擇
        const backgroundQualitySelect = document.getElementById('background-quality-select');
        if (backgroundQualitySelect) {
            backgroundQualitySelect.addEventListener('change', function() {
                const quality = this.value;
                if (window.vnBackgroundGenerator) {
                    window.vnBackgroundGenerator.updateSettings({ currentQuality: quality });
                }
                // console.log('[背景API設置] 品質已更新:', quality);
            });
        }
        
        // 測試背景生成
        const testBackgroundApiBtn = document.getElementById('test-background-api-btn');
        if (testBackgroundApiBtn) {
            testBackgroundApiBtn.addEventListener('click', async function() {
                const prompt = document.getElementById('test-background-prompt')?.value;
                if (!prompt || prompt.trim() === '') {
                    alert('請輸入圖片描述進行測試');
                    return;
                }
                
                const resultDiv = document.getElementById('background-api-test-result');
                if (resultDiv) {
                    resultDiv.innerHTML = '<div style="color: #666;">🔄 正在生成背景圖片...</div>';
                }
                
                try {
                    if (window.vnBackgroundGenerator) {
                        const imageUrl = await window.vnBackgroundGenerator.generateBackgroundImage(prompt, '測試設施');
                        if (imageUrl) {
                            if (resultDiv) {
                                resultDiv.innerHTML = `
                                    <div style="color: #28a745;">✅ 背景圖片生成成功！</div>
                                    <div style="margin-top: 10px;">
                                        <img src="${imageUrl}" alt="生成的背景" style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                                    </div>
                                    <div style="margin-top: 10px; font-size: 12px; color: #666;">
                                        <a href="${imageUrl}" target="_blank">在新視窗中查看</a>
                                    </div>
                                `;
                            }
                        } else {
                            if (resultDiv) {
                                resultDiv.innerHTML = '<div style="color: #dc3545;">❌ 背景圖片生成失敗</div>';
                            }
                        }
                    } else {
                        if (resultDiv) {
                            resultDiv.innerHTML = '<div style="color: #dc3545;">❌ 背景生成器未初始化</div>';
                        }
                    }
                } catch (error) {
                    console.error('[背景API設置] 測試失敗:', error);
                    if (resultDiv) {
                        resultDiv.innerHTML = '<div style="color: #dc3545;">❌ 測試過程中發生錯誤</div>';
                    }
                }
            });
        }
        
        // 查看生成歷史
        const viewBackgroundHistoryBtn = document.getElementById('view-background-history-btn');
        if (viewBackgroundHistoryBtn) {
            viewBackgroundHistoryBtn.addEventListener('click', function() {
                const historyList = document.getElementById('background-history-list');
                if (historyList) {
                    if (historyList.style.display === 'none') {
                        displayBackgroundHistory(historyList);
                        historyList.style.display = 'block';
                    } else {
                        historyList.style.display = 'none';
                    }
                }
            });
        }
        
        // 清除生成歷史
        const clearBackgroundHistoryBtn = document.getElementById('clear-background-history-btn');
        if (clearBackgroundHistoryBtn) {
            clearBackgroundHistoryBtn.addEventListener('click', function() {
                if (confirm('確定要清除所有生成歷史嗎？')) {
                    if (window.vnBackgroundGenerator) {
                        window.vnBackgroundGenerator.clearHistory();
                        const historyList = document.getElementById('background-history-list');
                        if (historyList) {
                            historyList.innerHTML = '<div style="color: #666;">歷史記錄已清除</div>';
                        }
                        // console.log('[背景API設置] 生成歷史已清除');
                    }
                }
            });
        }
        
        // console.log('[背景API設置] 事件綁定完成');
    } catch (error) {
        console.error('[背景API設置] 事件綁定失敗:', error);
    }
}

function loadBackgroundAPISettings() {
    try {
        if (!window.vnBackgroundGenerator) {
            console.warn('[背景API設置] 背景生成器未初始化');
            return;
        }
        
        const settings = window.vnBackgroundGenerator.getSettings();
        
        // 更新UI元素
        const backgroundApiEnabled = document.getElementById('background-api-enabled');
        if (backgroundApiEnabled) {
            backgroundApiEnabled.checked = settings.isEnabled;
        }
        
        const backgroundModelSelect = document.getElementById('background-model-select');
        if (backgroundModelSelect) {
            backgroundModelSelect.value = settings.currentModel;
        }
        
        const backgroundSizeSelect = document.getElementById('background-size-select');
        if (backgroundSizeSelect) {
            backgroundSizeSelect.value = settings.currentSize;
        }
        
        const backgroundQualitySelect = document.getElementById('background-quality-select');
        if (backgroundQualitySelect) {
            backgroundQualitySelect.value = settings.currentQuality;
        }
        
        // console.log('[背景API設置] 設置已載入:', settings);
    } catch (error) {
        console.error('[背景API設置] 載入設置失敗:', error);
    }
}

function displayBackgroundHistory(historyList) {
    try {
        if (!window.vnBackgroundGenerator) {
            historyList.innerHTML = '<div style="color: #666;">背景生成器未初始化</div>';
            return;
        }
        
        const history = window.vnBackgroundGenerator.getHistory();
        
        if (history.length === 0) {
            historyList.innerHTML = '<div style="color: #666;">暫無生成歷史</div>';
            return;
        }
        
        let html = '<div style="font-weight: bold; margin-bottom: 10px;">生成歷史記錄:</div>';
        
        history.forEach((record, index) => {
            const date = new Date(record.timestamp).toLocaleString();
            html += `
                <div style="border-bottom: 1px solid #ddd; padding: 8px 0; margin-bottom: 8px;">
                    <div style="font-weight: bold; color: #333;">${index + 1}. ${record.facilityName || '未命名設施'}</div>
                    <div style="font-size: 12px; color: #666; margin: 2px 0;">時間: ${date}</div>
                    <div style="font-size: 12px; color: #666; margin: 2px 0;">模型: ${record.model}</div>
                    <div style="font-size: 12px; color: #666; margin: 2px 0;">尺寸: ${record.size}</div>
                    <div style="font-size: 11px; color: #888; margin: 2px 0; word-break: break-all;">提示詞: ${record.prompt}</div>
                    <div style="margin-top: 5px;">
                        <img src="${record.imageUrl}" alt="生成的背景" style="max-width: 100%; max-height: 100px; border-radius: 4px;">
                    </div>
                </div>
            `;
        });
        
        historyList.innerHTML = html;
    } catch (error) {
        console.error('[背景API設置] 顯示歷史記錄失敗:', error);
        historyList.innerHTML = '<div style="color: #dc3545;">顯示歷史記錄時發生錯誤</div>';
    }
}

// =======================================================================
//                            初始化和導出
// =======================================================================

// 確保在DOM載入後初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            initMaterialSettingsUI();
        }, 100);
    });
} else {
    setTimeout(() => {
        initMaterialSettingsUI();
    }, 100);
}

// 導出主要函數供其他模組使用
window.MaterialSettings = {
    loadMaterialConfig,
    saveMaterialConfig,
    toggleMaterialSection,
    getCurrentConfig: () => currentMaterialConfig,
    getDefaultConfig: () => JSON.parse(JSON.stringify(DEFAULT_MATERIAL_CONFIG))
};

// console.log('[素材設置] 模組載入完成 - 清理版');
