/**
 * JCY COT (Chain of Thought) 思維鏈處理器
 * 用於管理思維鏈內容、設置和API整合
 * 已整合到VN提示詞管理系統中
 */

class JCYCOTProcessor {
    constructor() {
        this.enabled = false;
        this.content = '';
        this.settings = {
            position: 'before', // 'before' 或 'after'
            autoInject: true,
            integratedWithVN: true // 新增：標記已整合到VN提示詞
        };
        
        // 從localStorage載入保存的數據
        this.loadFromStorage();
        
        console.log('[JCY-COT] COT處理器已初始化（已整合到VN提示詞）');
    }
    
    /**
     * 檢查COT是否啟用
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }
    
    /**
     * 切換COT啟用狀態
     */
    toggleCOT() {
        this.enabled = !this.enabled;
        this.saveToStorage();
        console.log(`[JCY-COT] COT功能已${this.enabled ? '啟用' : '停用'}`);
    }
    
    /**
     * 獲取COT內容
     * @returns {string}
     */
    getCOTContent() {
        return this.content;
    }
    
    /**
     * 更新COT內容
     * @param {string} content - 新的COT內容
     */
    updateCOTContent(content) {
        this.content = content || '';
        this.saveToStorage();
        console.log('[JCY-COT] COT內容已更新');
    }
    
    /**
     * 獲取COT設置
     * @returns {object}
     */
    getCOTSettings() {
        return { ...this.settings };
    }
    
    /**
     * 更新COT設置
     * @param {object} newSettings - 新的設置
     */
    updateCOTSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveToStorage();
        console.log('[JCY-COT] COT設置已更新:', newSettings);
    }
    
    /**
     * 處理COT內容用於API調用（兼容舊版本）
     * @param {object} data - 包含messages的數據對象
     * @returns {object} 處理後的數據
     */
    processCOTForAPI(data) {
        if (!this.enabled || !this.content || !this.content.trim()) {
            return data;
        }
        
        const { messages } = data;
        if (!messages || !Array.isArray(messages)) {
            console.warn('[JCY-COT] messages不是有效數組');
            return data;
        }
        
        // 創建COT系統消息
        const cotSystemMessage = {
            role: 'system',
            content: this.content.trim()
        };
        
        // 根據位置設置插入COT內容
        if (this.settings.position === 'before') {
            // 在VN提示前插入
            messages.unshift(cotSystemMessage);
        } else {
            // 在VN提示後插入
            messages.push(cotSystemMessage);
        }
        
        console.log('[JCY-COT] COT內容已添加到API調用中（兼容模式）');
        return { ...data, messages };
    }
    
    /**
     * 獲取整合到VN提示詞的COT內容
     * @param {string} vnPrompt - VN提示詞內容
     * @returns {string} 整合後的提示詞
     */
    getIntegratedVNPrompt(vnPrompt) {
        if (!this.enabled || !this.content || !this.content.trim()) {
            // 如果COT未啟用或無內容，移除標記
            return vnPrompt.replace('{{COT_CONTENT}}', '');
        }
        
        // 替換COT標記為實際內容
        const integratedPrompt = vnPrompt.replace('{{COT_CONTENT}}', this.content.trim());
        console.log('[JCY-COT] 已整合COT到VN提示詞');
        return integratedPrompt;
    }
    
    /**
     * 檢查是否應該使用整合模式
     * @returns {boolean}
     */
    shouldUseIntegration() {
        return this.settings.integratedWithVN;
    }
    
    /**
     * 從localStorage載入數據
     */
    loadFromStorage() {
        try {
            const savedData = localStorage.getItem('jcy_cot_data');
            if (savedData) {
                const data = JSON.parse(savedData);
                this.enabled = data.enabled || false;
                this.content = data.content || '';
                this.settings = { ...this.settings, ...data.settings };
                console.log('[JCY-COT] 已從localStorage載入數據');
            }
        } catch (error) {
            console.error('[JCY-COT] 載入localStorage數據失敗:', error);
        }
    }
    
    /**
     * 保存數據到localStorage
     */
    saveToStorage() {
        try {
            const data = {
                enabled: this.enabled,
                content: this.content,
                settings: this.settings
            };
            localStorage.setItem('jcy_cot_data', JSON.stringify(data));
            console.log('[JCY-COT] 數據已保存到localStorage');
        } catch (error) {
            console.error('[JCY-COT] 保存到localStorage失敗:', error);
        }
    }
    
    /**
     * 清除所有COT數據
     */
    clearData() {
        this.enabled = false;
        this.content = '';
        this.settings = {
            position: 'before',
            autoInject: true,
            integratedWithVN: true
        };
        localStorage.removeItem('jcy_cot_data');
        console.log('[JCY-COT] 所有COT數據已清除');
    }
    
    /**
     * 獲取COT內容的token數量（估算）
     * @returns {number}
     */
    getTokenCount() {
        if (!this.content || !this.content.trim()) {
            return 0;
        }
        
        // 簡單的token估算：每4個字符約等於1個token
        return Math.ceil(this.content.trim().length / 4);
    }
    
    /**
     * 驗證COT內容格式
     * @returns {object} 驗證結果
     */
    validateContent() {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        
        if (!this.content || !this.content.trim()) {
            result.warnings.push('COT內容為空');
        }
        
        // 檢查基本語法
        const content = this.content.trim();
        
        // 檢查變量語法
        const varPattern = /\{\{setvar::([^:]+)::([^}]+)\}\}/g;
        const matches = content.match(varPattern);
        if (matches) {
            result.warnings.push(`發現${matches.length}個變量設定`);
        }
        
        // 檢查標籤語法
        const tagPattern = /<[^>]+>/g;
        const tags = content.match(tagPattern);
        if (tags) {
            result.warnings.push(`發現${tags.length}個標籤`);
        }
        
        return result;
    }
    
    /**
     * 獲取整合狀態信息
     * @returns {object}
     */
    getIntegrationStatus() {
        return {
            enabled: this.enabled,
            integrated: this.settings.integratedWithVN,
            hasContent: !!(this.content && this.content.trim()),
            tokenCount: this.getTokenCount(),
            position: this.settings.position
        };
    }
}

// 創建全局實例
window.JCYCOTProcessor = new JCYCOTProcessor();

// 導出類（如果支持模塊系統）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = JCYCOTProcessor;
}

console.log('[JCY-COT] JCY_COT_Processor.js 已載入（VN整合模式）'); 