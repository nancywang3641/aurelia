/**
 * ===== 奧瑞亞控制中心設置處理器 =====
 * 負責設置窗口的創建、顯示、隱藏和數據管理
 * 分離自 main_loader.js，保持模塊化架構
 */

(function() {
    'use strict';

    // ===== 設置面板相關變量 =====
    let settingsPanel = null;
    let isSettingsPanelVisible = false;

    // ===== 圖標映射表（用於設置面板預覽） =====
    const iconClassMap = {
        'phone-icon-preview': 'fa-solid fa-mobile-screen-button',
        'idcard-icon-preview': 'fa-solid fa-address-card',
        'map-icon-preview': 'fa-solid fa-door-open',
        'story-icon-preview': 'fa-solid fa-film',
        'chat-icon-preview': 'fa-solid fa-comment-dots',
        'echo-icon-preview': 'fa-solid fa-bullhorn',
        'forum-icon-preview': 'fa-solid fa-spider',
        'livestream-icon-preview': 'fa-solid fa-video',
        'inventory-icon-preview': 'fa-solid fa-suitcase',
        'shop-icon-preview': 'fa-solid fa-store',
        'datamanagement-icon-preview': 'fa-solid fa-folder-closed',
        'godview-icon-preview': 'fa-solid fa-book-quran',
        'dating-icon-preview': 'fa-solid fa-heart-pulse',
        'settings-icon-preview': 'fa-solid fa-gear',
        'imagesettings-icon-preview': 'fa-solid fa-images',
        'investigation-icon-preview': 'fa-solid fa-shield-halved',
        'horrorradio-icon-preview': 'fa-solid fa-skull'
    };


    // ===== CSS 樣式定義 =====
    const SETTINGS_STYLES = `
        <style>
            /* 設置面板樣式 */
                .settings-panel-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.7) !important;
                z-index: 99999999 !important;
                opacity: 0 !important;
                visibility: hidden !important;
                transition: all 0.3s ease !important;
                pointer-events: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 20px !important;
                box-sizing: border-box !important;
                }
                
                .settings-panel-overlay.active {
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: auto !important;
                }
                
                .settings-panel-container {
                position: relative !important;
                top: auto !important;
                left: auto !important;
                transform: none !important;
                width: min(700px, 90vw) !important;
                max-height: calc(100vh - 40px) !important;
                background: rgba(20, 20, 25, 0.95) !important;
                border: 2px solid rgba(255, 255, 255, 0.15) !important;
                border-radius: 20px !important;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
                backdrop-filter: blur(20px) saturate(150%) !important;
                z-index: 99999999 !important;
                overflow: hidden !important;
                opacity: 1 !important;
                pointer-events: auto !important;
                display: flex !important;
                flex-direction: column !important;
                }
                
                .settings-panel-container.active {
                transform: none !important;
                opacity: 1 !important;
                }
                
                .settings-panel-header {
                background: rgba(100, 181, 246, 0.2) !important;
                color: rgba(255, 255, 255, 0.9) !important;
                padding: 20px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
                
                .settings-panel-header h2 {
                margin: 0 !important;
                font-size: 1.3rem !important;
                font-weight: 600 !important;
                color: rgba(255, 255, 255, 0.9) !important;
                }
                
                .close-settings-btn {
                background: rgba(255, 255, 255, 0.2) !important;
                border: none !important;
                color: white !important;
                width: 35px !important;
                height: 35px !important;
                border-radius: 50% !important;
                font-size: 20px !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.2s !important;
                }
                
                .close-settings-btn:hover {
                background: rgba(255, 255, 255, 0.3) !important;
                transform: scale(1.1) !important;
                }
                
                .settings-panel-content {
                flex: 1 !important;
                overflow-y: auto !important;
                padding: 20px !important;
                background: rgba(20, 20, 25, 0.95) !important;
                }
                
                .settings-section {
                margin-bottom: 30px !important;
                }
                
                .section-title {
                background: rgba(255, 255, 255, 0.1) !important;
                padding: 15px !important;
                margin: 0 0 15px 0 !important;
                border-radius: 8px !important;
                font-size: 1.1rem !important;
                font-weight: 600 !important;
                color: rgba(255, 255, 255, 0.9) !important;
                cursor: pointer !important;
                user-select: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                transition: all 0.2s !important;
                }
                
                .section-title:hover {
                background: rgba(255, 255, 255, 0.2) !important;
                transform: translateY(-1px) !important;
            }
            
            .section-title.collapsible {
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
                
                .collapse-icon {
                transition: transform 0.3s !important;
                font-size: 0.8em !important;
                }
                
                .section-title.collapsed .collapse-icon {
                transform: rotate(-90deg) !important;
                }
                
                .settings-content {
                transition: all 0.3s ease !important;
                overflow: hidden !important;
                }
                
                .settings-content.collapsed {
                max-height: 0 !important;
                opacity: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                }
                
                .form-group {
                margin-bottom: 20px !important;
                }
                
                .form-group label {
                display: block !important;
                margin-bottom: 8px !important;
                font-weight: 500 !important;
                color: rgba(255, 255, 255, 0.8) !important;
            }
            
            .form-group input, .form-group select {
                width: 100% !important;
                padding: 12px !important;
                border: 2px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 8px !important;
                font-size: 14px !important;
                transition: all 0.2s !important;
                box-sizing: border-box !important;
                background: rgba(255, 255, 255, 0.05) !important;
                color: rgba(255, 255, 255, 0.9) !important;
            }
            
            .form-group input::placeholder {
                color: rgba(255, 255, 255, 0.4) !important;
            }
            
            .form-group input:focus, .form-group select:focus {
                border-color: rgba(100, 181, 246, 0.5) !important;
                box-shadow: 0 0 0 3px rgba(100, 181, 246, 0.1) !important;
                outline: none !important;
                background: rgba(255, 255, 255, 0.08) !important;
                }
                
                .form-help {
                font-size: 12px !important;
                color: rgba(255, 255, 255, 0.6) !important;
                margin-top: 5px !important;
                }
                
                .slider-container {
                display: flex !important;
                align-items: center !important;
                gap: 15px !important;
                }
                
                .size-slider {
                flex: 1 !important;
                height: 8px !important;
                border-radius: 4px !important;
                background: rgba(255, 255, 255, 0.1) !important;
                outline: none !important;
                -webkit-appearance: none !important;
                appearance: none !important;
                }
                
                .size-slider::-webkit-slider-thumb {
                -webkit-appearance: none !important;
                appearance: none !important;
                width: 20px !important;
                height: 20px !important;
                border-radius: 50% !important;
                background: rgba(100, 181, 246, 1) !important;
                cursor: pointer !important;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
                }
                
                .slider-value {
                font-weight: 600 !important;
                color: rgba(255, 255, 255, 0.9) !important;
                min-width: 60px !important;
                text-align: center !important;
                background: rgba(255, 255, 255, 0.1) !important;
                padding: 8px 12px !important;
                border-radius: 6px !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
                
                .icon-grid {
                display: grid !important;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) !important;
                gap: 15px !important;
                margin: 15px 0 !important;
                }
                
                .icon-item {
                padding: 15px !important;
                border: 2px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 8px !important;
                text-align: center !important;
                transition: all 0.2s !important;
                background: rgba(255, 255, 255, 0.05) !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
            }
            
            .icon-item:hover {
                border-color: rgba(100, 181, 246, 0.5) !important;
                box-shadow: 0 4px 12px rgba(100, 181, 246, 0.2) !important;
                transform: translateY(-2px) !important;
                background: rgba(255, 255, 255, 0.1) !important;
                }
                
                .icon-item label {
                display: block !important;
                margin-top: 10px !important;
                font-size: 12px !important;
                color: rgba(255, 255, 255, 0.8) !important;
                cursor: pointer !important;
                font-weight: 500 !important;
            }
            
                .icon-item input {
                width: 100% !important;
                margin-top: 8px !important;
                padding: 8px !important;
                font-size: 12px !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                color: rgba(255, 255, 255, 0.9) !important;
                border-radius: 6px !important;
                }
                
                .icon-item input:focus {
                border-color: rgba(100, 181, 246, 0.5) !important;
                background: rgba(255, 255, 255, 0.08) !important;
                outline: none !important;
                }
                
                .icon-preview {
                width: 64px !important;
                height: 64px !important;
                margin: 10px auto !important;
                border: 2px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 12px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                background: rgba(255, 255, 255, 0.05) !important;
                overflow: hidden !important;
                transition: all 0.2s !important;
                }
                
                .icon-preview img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
                }
                
                .icon-preview i {
                font-size: 32px !important;
                color: rgba(100, 181, 246, 1) !important;
                }
                
                .icon-preview.has-image {
                border-color: rgba(100, 181, 246, 0.5) !important;
                background: rgba(255, 255, 255, 0.05) !important;
                }
            
            .settings-panel-actions {
                padding: 20px !important;
                border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
                display: flex !important;
                gap: 15px !important;
                justify-content: flex-end !important;
                background: rgba(20, 20, 25, 0.95) !important;
            }
            
            .settings-btn {
                padding: 12px 24px !important;
                border: none !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                font-weight: 500 !important;
                transition: all 0.2s !important;
                font-size: 14px !important;
            }
            
            .settings-btn.primary {
                background: rgba(100, 181, 246, 0.3) !important;
                color: rgba(255, 255, 255, 0.9) !important;
                border: 1px solid rgba(100, 181, 246, 0.5) !important;
            }
            
            .settings-btn.primary:hover {
                background: rgba(100, 181, 246, 0.4) !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 4px 12px rgba(100, 181, 246, 0.3) !important;
            }
            
            .settings-btn.secondary {
                background: rgba(255, 255, 255, 0.1) !important;
                color: rgba(255, 255, 255, 0.9) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
            }
            
            .settings-btn.secondary:hover {
                background: rgba(255, 255, 255, 0.2) !important;
                transform: translateY(-1px) !important;
            }
            
            .settings-btn.danger {
                background: rgba(220, 53, 69, 0.3) !important;
                color: rgba(255, 255, 255, 0.9) !important;
                border: 1px solid rgba(220, 53, 69, 0.5) !important;
            }
            
            .settings-btn.danger:hover {
                background: rgba(220, 53, 69, 0.4) !important;
                transform: translateY(-1px) !important;
            }
            
            .upload-area {
                border: 2px dashed rgba(255, 255, 255, 0.2) !important;
                border-radius: 8px !important;
                padding: 20px !important;
                text-align: center !important;
                transition: all 0.2s !important;
                cursor: pointer !important;
                background: rgba(255, 255, 255, 0.05) !important;
                color: rgba(255, 255, 255, 0.8) !important;
            }
            
            .upload-area:hover {
                border-color: rgba(100, 181, 246, 0.5) !important;
                background: rgba(100, 181, 246, 0.1) !important;
            }
            
            .upload-btn {
                background: #28a745 !important;
                color: white !important;
                border: none !important;
                padding: 12px 20px !important;
                border-radius: 6px !important;
                cursor: pointer !important;
                font-weight: 500 !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 8px !important;
                transition: all 0.2s !important;
            }
            
            .upload-btn:hover {
                background: #218838 !important;
                transform: translateY(-1px) !important;
            }
            
            .upload-icon {
                font-size: 16px !important;
            }
            
            .upload-text {
                font-weight: 500 !important;
                }

                /* 響應式設計 - 移動端優化 */
                @media (max-width: 768px) {
                    .settings-panel-container {
                    width: calc(100vw - 20px) !important;
                    max-width: none !important;
                    max-height: calc(100vh - 40px) !important;
                    top: auto !important;
                    left: auto !important;
                    transform: none !important;
                }
                
                .settings-panel-container.active {
                    transform: none !important;
                    }
                    
                    .settings-panel-header {
                    padding: 15px !important;
                }
                
                .settings-panel-header h2 {
                    font-size: 1.1rem !important;
                    }
                    
                    .settings-panel-content {
                    padding: 15px !important;
                }
                
                .form-group {
                    margin-bottom: 15px !important;
                }
                
                .form-group input,
                .form-group select {
                    padding: 10px !important;
                    font-size: 14px !important;
                    }
                    
                    .icon-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                    gap: 10px !important;
                }
                
                .icon-item {
                    padding: 8px !important;
                }
                
                .icon-item label {
                    font-size: 12px !important;
                }
                
                .icon-preview {
                    width: 48px !important;
                    height: 48px !important;
                }
                
                .icon-preview i {
                    font-size: 24px !important;
                    color: rgba(100, 181, 246, 1) !important;
                }
                
                .upload-btn {
                    padding: 10px 16px !important;
                    font-size: 13px !important;
                }
                
                .upload-icon {
                    font-size: 14px !important;
                    }
                    
                    .settings-panel-actions {
                    padding: 15px !important;
                }
                
                .settings-btn {
                    padding: 12px 20px !important;
                    font-size: 14px !important;
                    }
                }
                
                @media (max-width: 480px) {
                    .settings-panel-container {
                    width: calc(100vw - 16px) !important;
                    max-height: calc(100vh - 32px) !important;
                }
                
                .settings-panel-header {
                    padding: 12px !important;
                }
                
                .settings-panel-header h2 {
                    font-size: 1rem !important;
                }
                
                .settings-panel-content {
                    padding: 12px !important;
                }
                
                .settings-panel-actions {
                    flex-direction: column !important;
                }
                
                .settings-btn {
                    width: 100% !important;
                    }
                    
                    .icon-grid {
                    grid-template-columns: 1fr !important;
                }
            }
        </style>
    `;

    // ===== 主要功能函數 =====

    /**
     * 創建設置面板
     */
    function createSettingsPanel() {
        // 完全清理舊的面板
        if (settingsPanel) {
            try {
                if (settingsPanel.parentNode) {
                    settingsPanel.parentNode.removeChild(settingsPanel);
                }
            } catch (e) {
                // Silent catch
            }
            settingsPanel = null;
        }
        
        settingsPanel = document.createElement('div');
        settingsPanel.id = 'aurelia-settings-panel';
        settingsPanel.innerHTML = `
            ${SETTINGS_STYLES}
            <div class="settings-panel-overlay" id="settingsPanelOverlay">
                <div class="settings-panel-container">
                    <div class="settings-panel-header">
                        <h2>🔧 奧瑞亞控制中心設置</h2>
                        <button class="close-settings-btn" id="closeSettingsBtn">&times;</button>
                    </div>
                    <div class="settings-panel-content">
                        <div class="settings-section">
                            <h3 class="section-title collapsible" data-target="icon-settings">
                                <span class="collapse-icon">▼</span>
                                🎨 Icon統一欄目
                            </h3>
                            <div class="settings-content collapsed" id="icon-settings">
                                <div class="form-group">
                                    <label>以下是內制預設，但要給URL輸入框，玩家可以自訂自己的icon</label>
                                </div>
                                
                                <div class="form-group">
                                    <label for="icon-size-slider">🎯 Icon圖片大小調整</label>
                                    <div class="slider-container">
                                        <input type="range" id="icon-size-slider" min="20" max="80" value="60" class="size-slider">
                                        <div class="slider-value">
                                            <span id="icon-size-value">60</span>px
                                        </div>
                                    </div>
                                    <div class="form-help">調整控制中心所有icon圖片的大小 (20px - 80px)，容器大小保持不變</div>
                                </div>
                                
                                <div class="icon-grid">
                                    <div class="icon-item">
                                        <div class="icon-preview" id="phone-icon-preview">
                                            <i class="fa-solid fa-mobile-screen-button"></i>
                                        </div>
                                        <label>📱 主控制中心</label>
                                        <input type="text" id="phone-icon-url" placeholder="主控制中心圖標URL" data-preview="phone-icon-preview" data-icon-class="fa-solid fa-mobile-screen-button">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="idcard-icon-preview">
                                            <i class="fa-solid fa-address-card"></i>
                                        </div>
                                        <label>👤 身份面板</label>
                                        <input type="text" id="idcard-icon-url" placeholder="身份面板圖標URL" data-preview="idcard-icon-preview" data-icon-class="fa-solid fa-address-card">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="map-icon-preview">
                                            <i class="fa-solid fa-door-open"></i>
                                        </div>
                                        <label>🗺️ 地圖面板</label>
                                        <input type="text" id="map-icon-url" placeholder="地圖面板圖標URL" data-preview="map-icon-preview" data-icon-class="fa-solid fa-door-open">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="story-icon-preview">
                                            <i class="fa-solid fa-film"></i>
                                        </div>
                                        <label>📖 劇情標籤</label>
                                        <input type="text" id="story-icon-url" placeholder="劇情Tab圖標URL" data-preview="story-icon-preview" data-icon-class="fa-solid fa-film">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="chat-icon-preview">
                                            <i class="fa-solid fa-comment-dots"></i>
                                        </div>
                                        <label>💬 聊天面板</label>
                                        <input type="text" id="chat-icon-url" placeholder="聊天面板圖標URL" data-preview="chat-icon-preview" data-icon-class="fa-solid fa-comment-dots">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="echo-icon-preview">
                                            <i class="fa-solid fa-bullhorn"></i>
                                        </div>
                                        <label>📢 Echo面板</label>
                                        <input type="text" id="echo-icon-url" placeholder="Echo面板圖標URL" data-preview="echo-icon-preview" data-icon-class="fa-solid fa-bullhorn">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="forum-icon-preview">
                                            <i class="fa-solid fa-spider"></i>
                                        </div>
                                        <label>🧵 Forum面板</label>
                                        <input type="text" id="forum-icon-url" placeholder="Forum面板圖標URL" data-preview="forum-icon-preview" data-icon-class="fa-solid fa-spider">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="livestream-icon-preview">
                                            <i class="fa-solid fa-video"></i>
                                        </div>
                                        <label>📺 直播面板</label>
                                        <input type="text" id="livestream-icon-url" placeholder="直播面板圖標URL" data-preview="livestream-icon-preview" data-icon-class="fa-solid fa-video">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="inventory-icon-preview">
                                            <i class="fa-solid fa-suitcase"></i>
                                        </div>
                                        <label>🎒 背包面板</label>
                                        <input type="text" id="inventory-icon-url" placeholder="背包面板圖標URL" data-preview="inventory-icon-preview" data-icon-class="fa-solid fa-suitcase">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="shop-icon-preview">
                                            <i class="fa-solid fa-store"></i>
                                        </div>
                                        <label>🛒 商城面板</label>
                                        <input type="text" id="shop-icon-url" placeholder="商城面板圖標URL" data-preview="shop-icon-preview" data-icon-class="fa-solid fa-store">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="datamanagement-icon-preview">
                                            <i class="fa-solid fa-folder-closed"></i>
                                        </div>
                                        <label>🗑️ 酒館數據</label>
                                        <input type="text" id="datamanagement-icon-url" placeholder="酒館數據圖標URL" data-preview="datamanagement-icon-preview" data-icon-class="fa-solid fa-folder-closed">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="godview-icon-preview">
                                            <i class="fa-solid fa-book-quran"></i>
                                        </div>
                                        <label>👁️ 記憶窺探</label>
                                        <input type="text" id="godview-icon-url" placeholder="記憶窺探圖標URL" data-preview="godview-icon-preview" data-icon-class="fa-solid fa-book-quran">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="dating-icon-preview">
                                            <i class="fa-solid fa-heart-pulse"></i>
                                        </div>
                                        <label>💕 心動酒館</label>
                                        <input type="text" id="dating-icon-url" placeholder="心動酒館圖標URL" data-preview="dating-icon-preview" data-icon-class="fa-solid fa-heart-pulse">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="settings-icon-preview">
                                            <i class="fa-solid fa-gear"></i>
                                        </div>
                                        <label>⚙️ 設置面板</label>
                                        <input type="text" id="settings-icon-url" placeholder="設置面板圖標URL" data-preview="settings-icon-preview" data-icon-class="fa-solid fa-gear">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="imagesettings-icon-preview">
                                            <i class="fa-solid fa-images"></i>
                                        </div>
                                        <label>🎨 圖片設置</label>
                                        <input type="text" id="imagesettings-icon-url" placeholder="圖片設置圖標URL" data-preview="imagesettings-icon-preview" data-icon-class="fa-solid fa-images">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="investigation-icon-preview">
                                            <i class="fa-solid fa-shield-halved"></i>
                                        </div>
                                        <label>🔍 刑案調查板</label>
                                        <input type="text" id="investigation-icon-url" placeholder="刑案調查板圖標URL" data-preview="investigation-icon-preview" data-icon-class="fa-solid fa-shield-halved">
                                    </div>
                                    <div class="icon-item">
                                        <div class="icon-preview" id="horrorradio-icon-preview">
                                            <i class="fa-solid fa-skull"></i>
                                        </div>
                                        <label>📻 午夜靈電台</label>
                                        <input type="text" id="horrorradio-icon-url" placeholder="午夜靈電台圖標URL" data-preview="horrorradio-icon-preview" data-icon-class="fa-solid fa-skull">
                                    </div>
                                </div>
                                <div style="text-align: right; margin-top: 10px;">
                                    <button id="resetIconsBtn" class="settings-btn secondary">重置為預設 Icon</button>
                                </div>
                            </div>
                        </div>

                        <div class="settings-section">
                            <h3 class="section-title collapsible" data-target="background-settings">
                                <span class="collapse-icon">▼</span>
                                🖼️ 版面背景
                            </h3>
                            <div class="settings-content collapsed" id="background-settings">
                                <div class="form-group">
                                    <label>背景圖片 URL</label>
                                    <input type="text" id="background-image-url" placeholder="輸入背景圖片 URL">
                                </div>
                                <div class="form-group">
                                    <label>背景模式</label>
                                    <select id="background-mode">
                                        <option value="cover">填滿 (cover)</option>
                                        <option value="contain">適應 (contain)</option>
                                        <option value="repeat">平鋪 (repeat)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="settings-section">
                            <h3 class="section-title collapsible" data-target="font-settings">
                                <span class="collapse-icon">▼</span>
                                🔤 字體
                            </h3>
                            <div class="settings-content collapsed" id="font-settings">
                                <div class="form-group">
                                    <label>字體 CSS 連結</label>
                                    <input type="text" id="font-css-url" placeholder="https://fontsapi.zeoseven.com/298/main/result.css">
                                </div>
                                <div class="form-group">
                                    <label>字體族名稱</label>
                                    <input type="text" id="font-family-name" placeholder="荆南波波黑">
                                </div>
                            </div>
                        </div>

                        <div id="multi_panel_settings_content"></div>
                    </div>
                    <div class="settings-panel-actions">
                        <button id="closeSettingsPanelBtn" class="btn btn-primary">關閉</button>
                    </div>
                </div>
            </div>`;
        
        document.body.appendChild(settingsPanel);
        bindSettingsEvents();
        
        console.log('✅ 奧瑞亞控制中心設置面板創建完成');
        return settingsPanel;
    }

    /**
     * 綁定設置面板事件
     */
    function bindSettingsEvents() {
        if (!settingsPanel || settingsPanel._eventsBound) return;
        
        // 關閉按鈕事件
        const closeBtn = document.getElementById('closeSettingsBtn');
        const closePanelBtn = document.getElementById('closeSettingsPanelBtn');
        const overlay = document.getElementById('settingsPanelOverlay');

        if (closeBtn) closeBtn.addEventListener('click', hideSettingsPanel);
        if (closePanelBtn) closePanelBtn.addEventListener('click', hideSettingsPanel);
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) hideSettingsPanel();
            });
        }

        // 折疊功能
        const collapsibleTitles = settingsPanel.querySelectorAll('.section-title.collapsible');
        collapsibleTitles.forEach(title => {
            title.addEventListener('click', function() {
                const targetId = this.getAttribute('data-target');
                const content = document.getElementById(targetId);
                
                if (content) {
                    content.classList.toggle('collapsed');
                    this.classList.toggle('collapsed');
                }
            });
        });
        
        // 背景類型切換
        const backgroundType = document.getElementById('background-type');
        if (backgroundType) {
            backgroundType.addEventListener('change', function() {
                const urlGroup = document.getElementById('background-url-group');
                const uploadGroup = document.getElementById('background-upload-group');
                
                if (this.value === 'upload') {
                    urlGroup.style.display = 'none';
                    uploadGroup.style.display = 'block';
                } else {
                    urlGroup.style.display = 'block';
                    uploadGroup.style.display = 'none';
                }
            });
        }
        
        // 文件上傳處理
        const fileInput = document.getElementById('background-file');
        if (fileInput) {
            fileInput.addEventListener('change', handleFileUpload);
        }

        // 重置按鈕
        const resetBtn = document.getElementById('resetSettingsBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                if (confirm('確定要重置所有設置嗎？')) {
                    resetAllSettings();
                }
            });
        }

        // Icon大小滑桿實時更新
        const iconSizeSlider = document.getElementById('icon-size-slider');
        const iconSizeValue = document.getElementById('icon-size-value');
        if (iconSizeSlider && iconSizeValue) {
            iconSizeSlider.addEventListener('input', function() {
                iconSizeValue.textContent = this.value;
            
                // 實時預覽效果
                if (window.AureliaControlCenter?.isVisible && window.AureliaControlCenter?.getAppGrid) {
                    const appGrid = window.AureliaControlCenter.getAppGrid();
                    if (appGrid && window.AureliaSettingsManager?.applyIconSize) {
                        window.AureliaSettingsManager.applyIconSize(parseInt(this.value), appGrid);
                    }
                }
            });
            
            iconSizeSlider.addEventListener('change', saveSettings);
        }

        // 自動保存
        const inputs = settingsPanel.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', saveSettings);
            
            // 圖標輸入框實時預覽
            if (input.id && input.id.includes('-icon-url') && input.dataset.preview) {
                input.addEventListener('input', function() {
                    updateIconPreview(this);
                });
                // 初始預覽
                updateIconPreview(input);
                
                let lastValue = input.value;
                input.addEventListener('blur', function() {
                    if (this.value !== lastValue) {
                        lastValue = this.value;
                        saveSettings();
                    }
                });
            } else {
                let lastValue = input.value;
                input.addEventListener('blur', function() {
                    if (this.value !== lastValue) {
                        lastValue = this.value;
                        saveSettings();
                    }
                });
            }
        });

        // 重置 Icon 按鈕
        const resetIconsBtn = document.getElementById('resetIconsBtn');
        if (resetIconsBtn) {
            resetIconsBtn.addEventListener('click', function() {
                if (!confirm('確定將所有圖標重置為預設嗎？')) return;
                try {
                    const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
                    settings.icons = {}; 
                    localStorage.setItem('aurelia-settings', JSON.stringify(settings));

                    const ids = [
                        'phone-icon-url','idcard-icon-url','map-icon-url','story-icon-url','chat-icon-url',
                        'echo-icon-url','forum-icon-url','livestream-icon-url','inventory-icon-url','shop-icon-url',
                        'datamanagement-icon-url','godview-icon-url','dating-icon-url','settings-icon-url','imagesettings-icon-url','investigation-icon-url','horrorradio-icon-url'
                    ];
                    ids.forEach(id => { 
                        const el = document.getElementById(id); 
                        if (el) {
                            el.value = '';
                            updateIconPreview(el);
                        }
                    });

                    try { window.AureliaControlCenter?.refreshIcons?.(); } catch (_) {}
                    alert('✅ 已重置為預設 Icon');
                } catch (e) {
                    console.error('重置 Icon 失敗:', e);
                }
            });
        }

        settingsPanel._eventsBound = true;
    }


    /**
     * 顯示設置面板
     */
    function showSettingsPanel() {
        console.log('🔧 顯示設置面板');
        
        if (window.AureliaLoader?.isPhoneModalVisible) {
            window.AureliaLoader?.hidePhoneModal?.();
        }
        
        createSettingsPanel();
        loadSettings();
        
        const overlay = document.getElementById('settingsPanelOverlay');
        const container = settingsPanel.querySelector('.settings-panel-container');
        
        if (overlay && container) {
            overlay.classList.add('active');
            container.classList.add('active');
            isSettingsPanelVisible = true;
        }
    }

    /**
     * 隱藏設置面板
     */
    function hideSettingsPanel() {
        if (!settingsPanel) return;
        
        const overlay = document.getElementById('settingsPanelOverlay');
        const container = settingsPanel.querySelector('.settings-panel-container');
        
        if (overlay && container) {
            overlay.classList.remove('active');
            container.classList.remove('active');
            isSettingsPanelVisible = false;
            
            setTimeout(() => {
                if (settingsPanel && settingsPanel.parentNode) {
                    settingsPanel.parentNode.removeChild(settingsPanel);
                    settingsPanel = null;
                }
            }, 300);
        }
    }

    /**
     * 載入設置
     */
    function loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            
            const iconFieldMap = [
                { id: 'phone-icon-url', key: 'phone' },
                { id: 'idcard-icon-url', key: 'idcard' },
                { id: 'map-icon-url', key: 'map' },
                { id: 'story-icon-url', key: 'story' },
                { id: 'chat-icon-url', key: 'chat' },
                { id: 'echo-icon-url', key: 'echo' },
                { id: 'forum-icon-url', key: 'forum' },
                { id: 'livestream-icon-url', key: 'livestream' },
                { id: 'inventory-icon-url', key: 'inventory' },
                { id: 'shop-icon-url', key: 'shop' },
                { id: 'datamanagement-icon-url', key: 'delete' },
                { id: 'godview-icon-url', key: 'godview' },
                { id: 'dating-icon-url', key: 'dating' },
                { id: 'settings-icon-url', key: 'settings' },
                { id: 'imagesettings-icon-url', key: 'imagesettings' },
                { id: 'investigation-icon-url', key: 'investigation' },
                { id: 'horrorradio-icon-url', key: 'horrorradio' }
            ];
            
            iconFieldMap.forEach(({ id, key }) => {
                const field = document.getElementById(id);
                if (field && settings.icons && settings.icons[key]) {
                    field.value = settings.icons[key];
                }
                if (field) {
                    updateIconPreview(field);
                }
            });
            
            if (settings.font) {
                const fontFamily = document.getElementById('font-family');
                const fontUrl = document.getElementById('font-url');
                if (fontFamily) fontFamily.value = settings.font.family || '';
                if (fontUrl) fontUrl.value = settings.font.url || '';
            } else {
                const fontUrlInput = document.getElementById('font-url');
                const fontFamilyInput = document.getElementById('font-family');
                
                if (fontUrlInput) fontUrlInput.value = 'https://fontsapi.zeoseven.com/298/main/result.css';
                if (fontFamilyInput) fontFamilyInput.value = '荆南波波黑';
            }
            
            if (settings.background) {
                const backgroundType = document.getElementById('background-type');
                const backgroundUrl = document.getElementById('background-url');
                
                if (backgroundType) {
                    backgroundType.value = settings.background.mode || 'url';
                    backgroundType.dispatchEvent(new Event('change'));
                }
                if (backgroundUrl) backgroundUrl.value = settings.background.url || '';
            }
            
            const iconSizeSlider = document.getElementById('icon-size-slider');
            const iconSizeValue = document.getElementById('icon-size-value');
            if (iconSizeSlider && iconSizeValue) {
                const size = settings.iconSize || 60;
                iconSizeSlider.value = size;
                iconSizeValue.textContent = size;
            }
            
            // console.log('✅ 設置已載入'); // Removed spam
        } catch (error) {
            console.error('❌ 載入設置失敗:', error);
        }
    }

    /**
     * 保存設置
     */
    function saveSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            
            if (!settings.icons) settings.icons = {};
            const iconFields = [
                { id: 'phone-icon-url', key: 'phone' },
                { id: 'idcard-icon-url', key: 'idcard' },
                { id: 'map-icon-url', key: 'map' },
                { id: 'story-icon-url', key: 'story' },
                { id: 'chat-icon-url', key: 'chat' },
                { id: 'echo-icon-url', key: 'echo' },
                { id: 'forum-icon-url', key: 'forum' },
                { id: 'livestream-icon-url', key: 'livestream' },
                { id: 'inventory-icon-url', key: 'inventory' },
                { id: 'shop-icon-url', key: 'shop' },
                { id: 'datamanagement-icon-url', key: 'delete' },
                { id: 'godview-icon-url', key: 'godview' },
                { id: 'dating-icon-url', key: 'dating' },
                { id: 'settings-icon-url', key: 'settings' },
                { id: 'imagesettings-icon-url', key: 'imagesettings' },
                { id: 'investigation-icon-url', key: 'investigation' },
                { id: 'horrorradio-icon-url', key: 'horrorradio' }
            ];
            
            iconFields.forEach(field => {
                const element = document.getElementById(field.id);
                if (element) {
                    settings.icons[field.key] = element.value;
                }
            });
            
            if (!settings.font) settings.font = {};
            const fontFamily = document.getElementById('font-family');
            const fontUrl = document.getElementById('font-url');
            if (fontFamily) settings.font.family = fontFamily.value;
            if (fontUrl) settings.font.url = fontUrl.value;
            
            if (!settings.background) settings.background = {};
            const backgroundType = document.getElementById('background-type');
            const backgroundUrl = document.getElementById('background-url');
            if (backgroundType) settings.background.mode = backgroundType.value;
            if (backgroundUrl) settings.background.url = backgroundUrl.value;
            
            const iconSizeSlider = document.getElementById('icon-size-slider');
            if (iconSizeSlider) {
                settings.iconSize = parseInt(iconSizeSlider.value);
            }
            
            localStorage.setItem('aurelia-settings', JSON.stringify(settings));

            try { applySettings(settings); } catch (_) {}
            
            setTimeout(() => {
                try { 
                    window.AureliaControlCenter?.refreshIcons?.(); 
                } catch (e) {
                    // silent catch
                }
            }, 100);
            
            console.log('✅ 設置已保存');
        } catch (error) {
            console.error('❌ 保存設置失敗:', error);
        }
    }

    /**
     * 重置所有設置
     */
    function resetAllSettings() {
        localStorage.removeItem('aurelia-settings');
        
        const inputs = settingsPanel.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (input.type === 'range') {
                input.value = input.getAttribute('value') || '60';
                if (input.id === 'icon-size-slider') {
                    const sizeValue = document.getElementById('icon-size-value');
                    if (sizeValue) sizeValue.textContent = '60';
                }
            } else if (input.id === 'font-family') {
                input.value = '蘋果麗中黑';
            } else {
                input.value = '';
            }
        });

        document.getElementById('background-url-group').style.display = 'block';
        document.getElementById('background-upload-group').style.display = 'none';

        console.log('✅ 所有設置已重置');
    }

    /**
     * 處理文件上傳
     */
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            alert('請選擇圖片文件！');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            if (!settings.background) settings.background = {};
            
            settings.background.uploadedData = e.target.result;
            settings.background.uploadedFileName = file.name;
            
            localStorage.setItem('aurelia-settings', JSON.stringify(settings));
        };
        reader.readAsDataURL(file);
    }

    /**
     * 載入字體CSS
     */
    function loadFontCSS(fontUrl, fontFamily) {
        try {
            // console.log('📤 開始載入字體CSS:', fontUrl); // Removed spam
            const existingLink = document.querySelector(`link[data-font-family="${fontFamily}"]`);
            if (existingLink) existingLink.remove();
            
            const fileExtension = fontUrl.toLowerCase().split('.').pop();
            
            if (fileExtension === 'css' || fontUrl.includes('result.css')) {
                loadCSSFont(fontUrl, fontFamily);
            } else if (['ttf', 'otf', 'woff', 'woff2'].includes(fileExtension)) {
                loadTTFFont(fontUrl, fontFamily);
            } else {
                loadCSSFont(fontUrl, fontFamily);
            }
        } catch (error) {
            console.error('❌ 載入字體CSS失敗:', error);
        }
    }

    /**
     * 載入CSS字體文件
     */
    function loadCSSFont(fontUrl, fontFamily) {
        try {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = fontUrl;
            link.setAttribute('data-font-family', fontFamily);
            document.head.appendChild(link);
        } catch (error) {
            console.error('❌ 創建CSS鏈接失敗:', error);
        }
    }

    /**
     * 載入TTF字體文件
     */
    function loadTTFFont(fontUrl, fontFamily) {
        try {
            const style = document.createElement('style');
            style.setAttribute('data-font-family', fontFamily);
            
            const fontFaceCSS = `
                @font-face {
                    font-family: "${fontFamily}";
                    src: url("${fontUrl}") format("truetype"),
                         url("${fontUrl}") format("opentype");
                    font-display: swap;
                    font-weight: normal;
                    font-style: normal;
                }
            `;
            
            style.textContent = fontFaceCSS;
            document.head.appendChild(style);
            
            if (window.FontFace) {
                const font = new FontFace(fontFamily, `url("${fontUrl}")`);
                font.load().then(() => {
                    document.fonts.add(font);
                }).catch((error) => {
                    // silent
                });
            }
        } catch (error) {
            console.error('❌ 載入TTF字體失敗:', error);
        }
    }

    /**
     * 獲取icon URL設置
     * 🔥 已清理所有日誌，防止迴圈刷屏
     */
    function getIconUrl(appNameOrKey) {
        try {
            const appName = appNameOrKey;
            
            const nameMap = {
                'VN面板': 'story', 'VN': 'story', '劇情': 'story',
                'Chat面板': 'chat', '聊天面板': 'chat', '聊天': 'chat',
                'Echo面板': 'echo', 'Echo': 'echo',
                'Forum面板': 'forum', '論壇面板': 'forum', '論壇': 'forum',
                'Livestream': 'livestream', '直播面板': 'livestream', '直播': 'livestream',
                'Map面板': 'map', '地圖面板': 'map', '地圖': 'map',
                '背包': 'inventory', '背包面板': 'inventory',
                '商城': 'shop', '商城面板': 'shop',
                '名片': 'idcard', '名片面板': 'idcard',
                '小说': 'story', '小說': 'story', '小說面板': 'story',
                '設置': 'settings', '设置': 'settings', '設置面板': 'settings',
                '酒館數據': 'delete', '酒館數據面板': 'delete',
                '記憶窺探': 'godview',
                '关闭': 'close', '關閉': 'close',
                '心動酒館': 'dating', 'dating': 'dating',
                '獨立API': 'apimanager',
                '世界書': 'lorebookmanager',
                'API數據': 'apidataviewer',
                '圖片設置': 'imagesettings', 'imagesettings': 'imagesettings',
                '刑案調查板': 'investigation', 'Investigation': 'investigation', 'investigation': 'investigation',
                '午夜靈電台': 'horrorradio', 'HorrorRadio': 'horrorradio', 'horrorradio': 'horrorradio'
            };

            const inverse = {
                story: '劇情', chat: '聊天', echo: 'Echo', forum: '論壇', livestream: '直播', map: '地圖',
                inventory: '背包', shop: '商城', idcard: '名片', settings: '設置', delete: '酒館數據', close: '關閉', godview: '記憶窺探',
                apimanager: '獨立API', lorebookmanager: '世界書', apidataviewer: 'API數據', imagesettings: '圖片設置', investigation: '刑案調查板', dating: '心動酒館', horrorradio: '午夜靈電台'
            };
            
            const key = nameMap[appName] || nameMap[inverse[appNameOrKey]] || appNameOrKey;
            
            const saved = localStorage.getItem('aurelia-settings');
            if (!saved) return null;

            const settings = JSON.parse(saved);
            if (!settings.icons) return null;

            const savedUrl = settings.icons[key];
            
            if (savedUrl && savedUrl.trim() !== '' && savedUrl !== 'none') {
                return savedUrl;
            }
            
            return null;
        } catch (error) {
            // silent fail is better here as this is called frequently
            return null;
        }
    }

    /**
     * 應用icon大小設置
     * 🔥 已清理迴圈內日誌
     */
    function applyIconSize(size, appGrid) {
        // console.log(`🎯 應用icon圖片大小設置: ${size}px`); // Keep quiet unless needed
        
        if (appGrid) {
            const minColumnWidth = Math.max(size + 30, 80);
            appGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`;
        }
        
        const buttons = appGrid.querySelectorAll('.aurelia-app-button');
        
        buttons.forEach(button => {
            const iconWrapper = button.querySelector('div[style*="border-radius: 12px"]');
            if (iconWrapper) {
                iconWrapper.style.width = `${size}px`;
                iconWrapper.style.height = `${size}px`;
            }
            
            const iconImg = button.querySelector('img');
            const iconI = button.querySelector('i.fa-solid, i.fa-regular, i.fa-brands, wa-icon');
            const iconDiv = button.querySelector('div[style*="filter: brightness(0) invert(1)"]');
            
            if (iconImg) {
                iconImg.style.width = `${Math.floor(size * 0.6)}px`;
                iconImg.style.height = `${Math.floor(size * 0.6)}px`;
            } else if (iconI) {
                iconI.style.fontSize = `${Math.floor(size * 0.5)}px`;
            } else if (iconDiv) {
                iconDiv.style.fontSize = `${Math.floor(size * 0.5)}px`;
            }
        });
    }

    /**
     * 創建安全icon
     */
    function createSafeIcon(app, isMobileDevice = false) {
        const appIcon = document.createElement('div');
        appIcon.style.cssText = `
            cursor: pointer;
            text-align: center;
            transition: all 0.2s ease;
            user-select: none;
        `;
        
        const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
        const savedIconSize = settings.iconSize || (isMobileDevice ? 50 : 60);
        
        const iconSize = isMobileDevice ? '45px' : '60px';
        const fontSize = isMobileDevice ? '20px' : '28px';
        const textSize = isMobileDevice ? '10px' : '12px';
        
        const iconUrl = getIconUrl(app.name);
        
        let iconContent;
        if (iconUrl && iconUrl !== 'none') {
            iconContent = `<img src="${iconUrl}" alt="${app.name}" style="width: ${savedIconSize}px; height: ${savedIconSize}px; object-fit: cover; border-radius: 12px;">`;
            } else {
            iconContent = app.icon;
        }
        
        appIcon.innerHTML = `
            <div style="
                width: ${iconSize}; 
                height: ${iconSize}; 
                background: rgba(255, 255, 255, 0.1); 
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 16px; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-size: ${fontSize}; 
                margin-bottom: ${isMobileDevice ? '6px' : '8px'}; 
                transition: all 0.2s ease;
                backdrop-filter: blur(5px);
                overflow: hidden;
            ">${iconContent}</div>
            <div style="
                color: rgba(255, 255, 255, 0.9); 
                font-size: ${textSize};
                font-weight: 500;
            ">${app.name}</div>
        `;
        
        appIcon.onclick = () => { 
            try {
                app.action(); 
            } catch (error) {
                console.error(`🔥 按鈕點擊錯誤 (${app.name}):`, error);
            }
            if(app.name === '關閉') window.AureliaLoader?.hidePhoneModal?.(); 
        };
        
        appIcon.onmouseenter = () => {
            appIcon.firstElementChild.style.transform = 'scale(1.1)';
            appIcon.firstElementChild.style.background = 'rgba(255, 255, 255, 0.2)';
        };
        
        appIcon.onmouseleave = () => {
            appIcon.firstElementChild.style.transform = 'scale(1)';
            appIcon.firstElementChild.style.background = 'rgba(255, 255, 255, 0.1)';
        };
        
        return appIcon;
    }

    /**
     * 應用全局字體函數 - 應用到所有面板
     */
    function applyGlobalFont() {
        try {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            const fontFamily = settings.font && settings.font.family ? 
                settings.font.family : '荆南波波黑';
            const fontUrl = settings.font && settings.font.url ? settings.font.url : 'https://fontsapi.zeoseven.com/298/main/result.css';
            const fontCSS = `"${fontFamily}", sans-serif`;
            
            if (fontUrl) {
                loadFontCSS(fontUrl, fontFamily);
            }
            
            // 應用到主控制面板
            if (window.AureliaLoader?.phoneModal) {
                const phoneScreen = window.AureliaLoader.phoneModal.querySelector('div[style*="border-radius:20px"]');
                if (phoneScreen) {
                    phoneScreen.style.fontFamily = fontCSS;
                    const allElements = phoneScreen.querySelectorAll('*');
                    allElements.forEach(element => {
                        const isIconElement = (element.tagName === 'I' && (
                            element.classList.contains('fa') || 
                            element.classList.contains('fa-solid') || 
                            element.classList.contains('fa-regular') || 
                            element.classList.contains('fa-brands') ||
                            element.className.includes('fa-')
                        )) || element.tagName === 'WA-ICON';
                        
                        const isNavButton = element.classList.contains('nav-button') || 
                                           element.closest('.nav-button');
                        
                        if (!isIconElement && !isNavButton) {
                            element.style.fontFamily = fontCSS;
                        }
                    });
                }
            }
            
            // 應用到所有iframe面板
            const iframes = document.querySelectorAll('iframe[id$="-panel"]');
            iframes.forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument;
                    if (iframeDoc) {
                        iframeDoc.body.style.fontFamily = fontCSS;
                        const iframeElements = iframeDoc.querySelectorAll('*');
                        iframeElements.forEach(element => {
                            element.style.fontFamily = fontCSS;
                        });
                    }
                } catch (error) {
                    // silent
                }
            });
            
            // console.log('✅ 全局字體應用完成'); // Keep quiet
        } catch (error) {
            console.error('❌ 應用全局字體失敗:', error);
        }
    }

    /**
     * 應用字體到主控制面板函數（從設置）
     */
    function applyFontToMainPanelFromSettings(phoneScreen) {
        try {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            const fontFamily = settings.font && settings.font.family ? 
                settings.font.family : '荆南波波黑';
            const fontUrl = settings.font && settings.font.url ? settings.font.url : 'https://fontsapi.zeoseven.com/298/main/result.css';
            const fontCSS = `"${fontFamily}", sans-serif`;
            
            if (fontUrl) {
                loadFontCSS(fontUrl, fontFamily);
            }
            
            if (phoneScreen) {
                phoneScreen.style.fontFamily = fontCSS;
                const allElements = phoneScreen.querySelectorAll('*');
                allElements.forEach(element => {
                    const isIconElement = (element.tagName === 'I' && (
                        element.classList.contains('fa') || 
                        element.classList.contains('fa-solid') || 
                        element.classList.contains('fa-regular') || 
                        element.classList.contains('fa-brands') ||
                        element.className.includes('fa-')
                    )) || element.tagName === 'WA-ICON';
                    
                    const isNavButton = element.classList.contains('nav-button') || 
                                       element.closest('.nav-button');
                    
                    if (!isIconElement && !isNavButton) {
                        element.style.fontFamily = fontCSS;
                    }
                });
            }
        } catch (error) {
            console.error('❌ 應用字體到主控制面板失敗:', error);
        }
    }

    /**
     * 應用字體到設置面板函數
     */
    function applyFontToSettingsPanel() {
        try {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            const fontFamily = settings.font && settings.font.family ? 
                settings.font.family : '荆南波波黑';
            const fontUrl = settings.font && settings.font.url ? settings.font.url : 'https://fontsapi.zeoseven.com/298/main/result.css';
            const fontCSS = `"${fontFamily}", sans-serif`;
            
                if (settingsPanel) {
                if (fontUrl) {
                    loadFontCSS(fontUrl, fontFamily);
                }
                
                settingsPanel.style.fontFamily = fontCSS;
                const allElements = settingsPanel.querySelectorAll('*');
                allElements.forEach(element => {
                    element.style.fontFamily = fontCSS;
                });
            }
        } catch (error) {
            console.error('❌ 應用字體到設置面板失敗:', error);
        }
    }

    /**
     * 調試函數：檢查控制中心字體設置
     */
    function debugControlCenterFont() {
        try {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            return settings;
        } catch (error) {
            console.error('❌ 檢查控制中心字體設置失敗:', error);
            return null;
        }
    }

    /**
     * 預覽字體
     */
    function previewFont() {
        const fontUrl = document.getElementById('font-url').value;
        const fontFamily = document.getElementById('font-family').value;
        
        if (!fontUrl || !fontFamily) {
            alert('請填寫字體URL和字體名稱');
            return;
        }
        
        try {
            loadFontCSS(fontUrl, fontFamily);
            const previewBox = document.getElementById('font-preview');
            if (previewBox) {
                previewBox.style.fontFamily = `"${fontFamily}", sans-serif`;
            }
        } catch (error) {
            console.error('❌ 字體預覽失敗:', error);
            alert('字體預覽失敗，請檢查URL是否正確');
        }
    }

    /**
     * 應用字體
     */
    function applyFont() {
        const fontUrl = document.getElementById('font-url').value;
        const fontFamily = document.getElementById('font-family').value;
        
        if (!fontUrl || !fontFamily) {
            alert('請填寫字體URL和字體名稱');
            return;
        }
        
        try {
            loadFontCSS(fontUrl, fontFamily);
            applyGlobalFont();
            
            if (window.AureliaControlCenter?.applyFontToAllPanels) {
                window.AureliaControlCenter.applyFontToAllPanels();
            }
            applyFontToSettingsPanel();
            
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            settings.font = {
                url: fontUrl,
                family: fontFamily
            };
            localStorage.setItem('aurelia-settings', JSON.stringify(settings));
            
            console.log('✅ 字體已應用:', fontFamily);
        } catch (error) {
            console.error('❌ 應用字體失敗:', error);
            alert('字體應用失敗: ' + error.message);
        }
    }

    /**
     * 更新圖標預覽
     */
    function updateIconPreview(inputElement) {
        if (!inputElement || !inputElement.dataset.preview) return;
        
        const previewId = inputElement.dataset.preview;
        const iconClass = inputElement.dataset.iconClass || '';
        const previewContainer = document.getElementById(previewId);
        
        if (!previewContainer) return;
        
        const iconUrl = inputElement.value.trim();
        
        previewContainer.innerHTML = '';
        previewContainer.classList.remove('has-image');
        
        if (iconUrl && iconUrl !== 'none') {
            const img = document.createElement('img');
            img.src = iconUrl;
            img.alt = inputElement.placeholder || '圖標';
            img.onerror = function() {
                if (iconClass) {
                    const iconElement = document.createElement('i');
                    iconElement.className = iconClass;
                    previewContainer.appendChild(iconElement);
                }
                previewContainer.classList.remove('has-image');
            };
            img.onload = function() {
                previewContainer.appendChild(img);
                previewContainer.classList.add('has-image');
            };
        } else {
            if (iconClass) {
                const iconElement = document.createElement('i');
                iconElement.className = iconClass;
                previewContainer.appendChild(iconElement);
            }
        }
    }

    /**
     * 應用設置
     */
    function applySettings(settings) {
        // console.log('🔧 應用設置'); // Keep quiet
        
        if (window.AureliaControlCenter?.isVisible && window.AureliaControlCenter?.getAppGrid && window.AureliaControlCenter?.getPhoneScreen) {
            const phoneScreen = window.AureliaControlCenter.getPhoneScreen();
            const appGrid = window.AureliaControlCenter.getAppGrid();
            if (phoneScreen && appGrid) {
                if (settings.background) {
                    applyBackgroundToMainPanel(phoneScreen, settings.background);
                }
                if (settings.iconSize) {
                    applyIconSize(settings.iconSize, appGrid);
                }

                setTimeout(() => {
                    try { 
                        window.AureliaControlCenter?.refreshIcons?.(); 
                    } catch (e) {
                        // silent
                    }
                }, 150);
            }
        }
        
        if (settings.font) {
            applyGlobalFont();
            if (window.AureliaControlCenter?.applyFontToAllPanels) {
                window.AureliaControlCenter.applyFontToAllPanels();
            }
            applyFontToSettingsPanel();
        }
    }

    /**
     * 應用背景到主面板
     */
    function applyBackgroundToMainPanel(phoneScreen, backgroundSettings) {
        try {
            const settings = JSON.parse(localStorage.getItem('aurelia-settings') || '{}');
            if (!settings.background) return;
            
            if (settings.background.mode === 'url' && settings.background.url) {
                phoneScreen.style.backgroundImage = `url(${settings.background.url})`;
                phoneScreen.style.backgroundSize = 'cover';
                phoneScreen.style.backgroundPosition = 'center';
                phoneScreen.style.backgroundRepeat = 'no-repeat';
            } else if (settings.background.mode === 'upload' && settings.background.uploadedData) {
                phoneScreen.style.backgroundImage = `url(${settings.background.uploadedData})`;
                phoneScreen.style.backgroundSize = 'cover';
                phoneScreen.style.backgroundPosition = 'center';
                phoneScreen.style.backgroundRepeat = 'no-repeat';
            } else {
                phoneScreen.style.backgroundImage = '';
                phoneScreen.style.backgroundSize = '';
                phoneScreen.style.backgroundPosition = '';
                phoneScreen.style.backgroundRepeat = '';
            }
        } catch (error) {
            console.error('❌ 應用背景失敗:', error);
        }
    }

    // ===== 公開API =====
    window.AureliaSettingsManager = {
        show: showSettingsPanel,
        hide: hideSettingsPanel,
        toggle: function() {
            if (isSettingsPanelVisible) {
                hideSettingsPanel();
            } else {
                showSettingsPanel();
            }
        },
        loadSettings,
        saveSettings,
        resetAllSettings,
        isVisible: () => isSettingsPanelVisible,
        // 字體相關函數
        loadFontCSS,
        applyGlobalFont,
        applyFontToMainPanelFromSettings,
        applyFontToSettingsPanel,
        debugControlCenterFont,
        previewFont,
        applyFont,
        // Icon相關函數
        getIconUrl,
        applyIconSize,
        createSafeIcon,
        // 其他工具函數
        applySettings
    };

    console.log('✅ 設置處理器已載入 (日誌已清理)');

})();