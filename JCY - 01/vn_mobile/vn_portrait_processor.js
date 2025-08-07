/**
 * VN立繪處理器 - 自動生成角色立繪URL
 * 根據角色名和表情自動構建圖片URL
 */

class VNPortraitProcessor {
    constructor() {
        // 動態獲取立繪設置
        this.loadSettings();
    }

    // 載入立繪設置
    loadSettings() {
        if (window.VNMaterialProcessor?.getPortraitSettings) {
            const settings = window.VNMaterialProcessor.getPortraitSettings();
            this.baseUrl = settings.baseUrl || 'https://nancywang3641.github.io/sound-files/char_presets/';
            this.format = settings.format || '_presets.png';
        } else {
            this.baseUrl = 'https://nancywang3641.github.io/sound-files/char_presets/';
            this.format = '_presets.png';
        }
        this.fallbackUrl = this.baseUrl + 'default_presets.png';
    }

    // 設置立繪配置
    setConfig(baseUrl, format) {
        this.baseUrl = baseUrl || this.baseUrl;
        this.format = format || this.format;
        this.fallbackUrl = this.baseUrl + 'default_presets.png';
        console.log('[VN立繪處理器] 配置已更新:', { baseUrl: this.baseUrl, format: this.format });
    }

    // 生成角色立繪URL
    async generatePortraitUrl(characterName, expression = '') {
        try {
            // 清理角色名（保留下底線和連字符，移除其他特殊字符）
            const cleanName = characterName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
            
            if (!cleanName) {
                console.warn('[VN立繪處理器] 角色名為空，使用預設圖片');
                return this.fallbackUrl;
            }

            // 檢查是否使用上傳模式
            const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
            const isUploadMode = savedSettings.sourceMode === 'upload';
            
            if (isUploadMode && window.materialImageManager) {
                // 上傳模式：從IndexedDB獲取圖片
                try {
                    const images = await window.materialImageManager.getImagesByCategory('portrait');
                    
                    // 構建搜索文件名
                    let searchFileName;
                    if (expression && expression.trim()) {
                        const cleanExpression = expression.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                        searchFileName = `${cleanName}_${cleanExpression}`;
                    } else {
                        searchFileName = cleanName;
                    }
                    
                    // 查找匹配的圖片
                    const matchedImage = images.find(img => {
                        const imgName = img.name.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
                        return imgName === searchFileName || imgName.includes(searchFileName);
                    });
                    
                    if (matchedImage) {
                        console.log('[VN立繪處理器] 從IndexedDB找到立繪:', matchedImage.name);
                        return matchedImage.url;
                    } else {
                        console.warn('[VN立繪處理器] IndexedDB中未找到立繪，使用預設URL:', searchFileName);
                    }
                } catch (error) {
                    console.error('[VN立繪處理器] 從IndexedDB獲取立繪失敗:', error);
                }
            }

            // URL模式或IndexedDB未找到：使用URL構建
            let url;
            if (expression && expression.trim()) {
                // 有表情的情況：{baseUrl}/{角色名}_{表情}{format}
                const cleanExpression = expression.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
                url = `${this.baseUrl}${cleanName}_${cleanExpression}${this.format}`;
            } else {
                // 無表情的情況：{baseUrl}/{角色名}{format}
                url = `${this.baseUrl}${cleanName}${this.format}`;
            }

            console.log('[VN立繪處理器] 生成立繪URL:', { characterName, expression, url, mode: isUploadMode ? 'upload' : 'url' });
            return url;
        } catch (error) {
            console.error('[VN立繪處理器] 生成立繪URL失敗:', error);
            return this.fallbackUrl;
        }
    }

    // 解析VN對話格式，提取角色名和表情
    async parseVNLine(vnLine) {
        try {
            // 格式：[角色名|服裝|表情|對話|sound_effect]
            const match = vnLine.match(/^\[([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\]$/);
            
            if (match) {
                const [, characterName, clothing, expression, dialogue, soundEffect] = match;
                const portraitUrl = await this.generatePortraitUrl(characterName.trim(), expression.trim());
                
                return {
                    characterName: characterName.trim(),
                    clothing: clothing.trim(),
                    expression: expression.trim(),
                    dialogue: dialogue.trim(),
                    soundEffect: soundEffect.trim(),
                    portraitUrl: portraitUrl
                };
            }
            
            return null;
        } catch (error) {
            console.error('[VN立繪處理器] 解析VN對話失敗:', error);
            return null;
        }
    }

    // 批量處理VN對話
    async processVNDialogues(vnDialogues) {
        try {
            const results = [];
            
            for (const line of vnDialogues) {
                const parsed = await this.parseVNLine(line);
                if (parsed) {
                    results.push(parsed);
                }
            }
            
            console.log('[VN立繪處理器] 批量處理完成，共處理', results.length, '個對話');
            return results;
        } catch (error) {
            console.error('[VN立繪處理器] 批量處理失敗:', error);
            return [];
        }
    }

    // 預覽立繪（測試URL是否有效）
    async previewPortrait(characterName, expression = '') {
        try {
            const url = this.generatePortraitUrl(characterName, expression);
            
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    console.log('[VN立繪處理器] 立繪預覽成功:', url);
                    resolve({ success: true, url, width: img.width, height: img.height });
                };
                img.onerror = () => {
                    console.warn('[VN立繪處理器] 立繪預覽失敗:', url);
                    resolve({ success: false, url, error: '圖片加載失敗' });
                };
                img.src = url;
            });
        } catch (error) {
            console.error('[VN立繪處理器] 預覽立繪失敗:', error);
            return { success: false, error: error.message };
        }
    }

    // 獲取所有可能的立繪URL（用於預加載）
    async getAllPossibleUrls(characters, expressions = []) {
        try {
            const urls = [];
            
            for (const character of characters) {
                // 添加角色預設立繪
                const portraitUrl = await this.generatePortraitUrl(character.name);
                urls.push(portraitUrl);
                
                // 添加表情立繪
                for (const expression of expressions) {
                    const expressionUrl = await this.generatePortraitUrl(character.name, expression);
                    urls.push(expressionUrl);
                }
            }
            
            // 去重
            const uniqueUrls = [...new Set(urls)];
            console.log('[VN立繪處理器] 生成所有可能的立繪URL:', uniqueUrls.length, '個');
            return uniqueUrls;
        } catch (error) {
            console.error('[VN立繪處理器] 生成所有URL失敗:', error);
            return [];
        }
    }

    // 驗證立繪配置
    validateConfig() {
        const issues = [];
        
        if (!this.baseUrl) {
            issues.push('立繪基礎URL為空');
        }
        
        if (!this.format) {
            issues.push('立繪格式為空');
        }
        
        if (issues.length > 0) {
            console.warn('[VN立繪處理器] 配置驗證失敗:', issues);
            return false;
        }
        
        console.log('[VN立繪處理器] 配置驗證通過');
        return true;
    }

    // 獲取當前配置
    getConfig() {
        return {
            baseUrl: this.baseUrl,
            format: this.format,
            fallbackUrl: this.fallbackUrl
        };
    }
}

// 創建全局實例（如果還沒有定義的話）
if (!window.VNPortraitProcessor) {
    window.VNPortraitProcessor = new VNPortraitProcessor();
}

// 導出給其他模塊使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VNPortraitProcessor;
} 