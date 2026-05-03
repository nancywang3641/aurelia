/**
 * ========================
 * Aurelia Loader Core
 * 核心初始化模塊 (精簡版)
 * 版本：3.0.0-lite
 * ========================
 */

(function() {
    'use strict';

    // ========================
    // 1. 版本信息
    // ========================
    const VERSION = {
        major: 3,
        minor: 0,
        patch: 0,
        build: 'lite',
        toString() {
            return `v${this.major}.${this.minor}.${this.patch}-${this.build}`;
        }
    };

    // ========================
    // 2. 核心配置 (只保留 VN 和 腦洞)
    // ========================
    const CORE_CONFIG = {
        EXTENSION_NAME: '多功能面板系統 (精簡版)',
        
        // 🔥 這裡只留您需要的面板路徑
        PANELS: {
            VN: './scripts/extensions/third-party/my-tavern-extension/panels/vn/vn_panel.html'
        },
        
        // UI 基礎配置
        UI: {
            ICON_SIZE: '40px',
            Z_INDEX_ICON: 999999,
            Z_INDEX_PANEL: 99999
        },
        
        // 設備檢測 (手機模式需要用)
        DEVICE: {
            isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
            isNarrow: window.innerWidth < 768
        },
        
        // 存儲鍵名
        STORAGE_KEYS: {
            EXTENSION_SETTINGS: 'extension_settings',
            AURELIA_SETTINGS: 'aurelia-settings'
        }
    };

    // ========================
    // 3. 日誌系統 (保留以便除錯)
    // ========================
    const Logger = {
        prefix: '[Aurelia Lite]',
        info(...args) { console.log(this.prefix, '✅', ...args); },
        warn(...args) { console.warn(this.prefix, '⚠️', ...args); },
        error(...args) { console.error(this.prefix, '❌', ...args); },
        startup() {
            console.log(`%c Aurelia Loader ${VERSION.toString()} %c VN / Extractor Only `, 
                'background: #35495e; color: #fff; padding: 2px 5px; border-radius: 3px 0 0 3px;',
                'background: #41b883; color: #fff; padding: 2px 5px; border-radius: 0 3px 3px 0;');
        }
    };

    // ========================
    // 4. 配置管理器
    // ========================
    const ConfigManager = {
        getExtensionSettings() {
            // 簡單的設置讀取邏輯
            const key = CORE_CONFIG.EXTENSION_NAME;
            if (!window.extension_settings) window.extension_settings = {};
            
            // 1. 內存
            if (window.extension_settings[key]) return window.extension_settings[key];
            
            // 2. LocalStorage
            try {
                const saved = localStorage.getItem(CORE_CONFIG.STORAGE_KEYS.EXTENSION_SETTINGS);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed[key]) {
                        window.extension_settings[key] = parsed[key];
                        return parsed[key];
                    }
                }
            } catch (e) { console.error('讀取設置失敗', e); }
            
            // 3. 默認值
            return { enabled: true, version: VERSION.toString() };
        },
        
        getConfig(key) {
            // 簡單的屬性獲取
            return CORE_CONFIG[key] || null;
        }
    };

    // ========================
    // 5. 錯誤處理器 (防止崩潰)
    // ========================
    const ErrorHandler = {
        init() {
            window.addEventListener('error', (e) => {
                if (e.filename && e.filename.includes('my-tavern-extension')) {
                    Logger.error('擴展內部錯誤:', e.message);
                }
            });
        },
        safeExecute(fn, ...args) {
            try { return fn(...args); } 
            catch (e) { Logger.error('執行失敗:', e); return null; }
        }
    };

    // ========================
    // 6. 核心初始化器
    // ========================
    const CoreInitializer = {
        initialized: false,
        
        async init() {
            if (this.initialized) return;
            
            Logger.startup();
            ErrorHandler.init();
            
            // 設置全局對象供其他模組調用
            window.AureliaCore = {
                version: VERSION.toString(),
                config: CORE_CONFIG,
                logger: Logger,
                configManager: ConfigManager,
                errorHandler: ErrorHandler,
                // 簡單的依賴注入模擬
                dependencyInjector: {
                    register: () => {}, 
                    get: () => null
                }
            };
            
            this.initialized = true;
            Logger.info('核心模組初始化完成');
            return { success: true };
        }
    };

    // ========================
    // 導出 API
    // ========================
    window.AureliaLoaderCore = {
        init: () => CoreInitializer.init(),
        Logger,
        ConfigManager,
        CORE_CONFIG,
        VERSION,
        isInitialized: () => CoreInitializer.initialized
    };

})();