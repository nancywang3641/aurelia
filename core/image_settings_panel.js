/**
 * ===== 图片设置面板 =====
 * 独立的面板，用于管理图片生成设置
 * 支持：Pollinations（免费）和 NovelAI（付费）
 */

(function() {
    'use strict';

    const logger = {
        info: (msg, ...args) => console.log(`[图片设置面板] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[图片设置面板] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[图片设置面板] ${msg}`, ...args),
        debug: (msg, ...args) => console.log(`[图片设置面板] DEBUG: ${msg}`, ...args)
    };

    /**
     * 图片设置面板管理器
     */
    const ImageSettingsPanel = {
        /**
         * 显示图片设置面板
         */
        async show() {
            logger.info('显示图片设置面板...');
            
            // 防重复调用
            if (window._isShowingImageSettingsPanel) {
                logger.warn('面板已经在显示中，忽略重复调用');
                return;
            }
            window._isShowingImageSettingsPanel = true;
            
            try {
                await this.createModal();
                // 等待DOM创建后再初始化
                setTimeout(() => {
                    this.initializePanel();
                }, 100);
            } catch (error) {
                logger.error('创建面板失败: ' + error.message);
                this.showErrorNotification('❌ 创建面板失败: ' + error.message);
            } finally {
                window._isShowingImageSettingsPanel = false;
            }
        },

        /**
         * 创建模态窗口
         */
        async createModal() {
            const parentDoc = document;
            
            // 检查是否已存在
            let modal = parentDoc.getElementById('image-settings-panel-modal');
            if (modal) {
                modal.remove();
            }
            
            // 创建模态窗口
            modal = parentDoc.createElement('div');
            modal.id = 'image-settings-panel-modal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.7);
                z-index: 99999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
            `;
            
            // 创建内容容器
            const content = parentDoc.createElement('div');
            content.style.cssText = `
                background: #1a1a1a;
                border-radius: 12px;
                width: min(900px, 90vw);
                max-height: calc(100vh - 40px);
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                border: 1px solid #333333;
                overflow: hidden;
            `;
            
            // 注入样式
            this.injectStyles(parentDoc);
            
            // 设置内容
            content.innerHTML = this.getPanelHTML();
            
            modal.appendChild(content);
            parentDoc.body.appendChild(modal);
            
            // 绑定关闭按钮
            const closeBtn = content.querySelector('#close-image-settings-panel');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.hide();
                });
            }
            
            // 点击背景关闭
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hide();
                }
            });
        },

        /**
         * 隐藏面板
         */
        hide() {
            const modal = document.getElementById('image-settings-panel-modal');
            if (modal) {
                modal.remove();
            }
            window._isShowingImageSettingsPanel = false;
        },

        /**
         * 注入样式
         */
        injectStyles(parentDoc) {
            const styleId = 'image-settings-panel-styles';
            if (parentDoc.getElementById(styleId)) {
                return; // 样式已存在
            }
            
            const style = parentDoc.createElement('style');
            style.id = styleId;
            style.textContent = this.getPanelCSS();
            parentDoc.head.appendChild(style);
        },

        /**
         * 获取面板CSS
         */
        getPanelCSS() {
            return `
                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9) translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                
                #image-settings-panel-modal * {
                    box-sizing: border-box;
                }
                
                .image-settings-header {
                    background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%) !important;
                    color: white !important;
                    padding: 30px !important;
                    text-align: center !important;
                    border-bottom: 1px solid #333333 !important;
                }
                
                .image-settings-header h1 {
                    font-size: 28px !important;
                    font-weight: 600 !important;
                    margin: 0 0 8px 0 !important;
                }
                
                .image-settings-header p {
                    opacity: 0.9 !important;
                    font-size: 16px !important;
                    margin: 0 !important;
                }
                
                .image-settings-content {
                    padding: 40px !important;
                    background: #1a1a1a !important;
                    color: #ffffff !important;
                    flex: 1 !important;
                    overflow-y: auto !important;
                    max-height: calc(100vh - 200px) !important;
                }
                
                .image-settings-form-group {
                    margin-bottom: 25px !important;
                }
                
                .image-settings-form-group label {
                    display: block !important;
                    font-weight: 600 !important;
                    color: #ffffff !important;
                    margin-bottom: 8px !important;
                    font-size: 14px !important;
                }
                
                .image-settings-form-group input,
                .image-settings-form-group select,
                .image-settings-form-group textarea {
                    width: 100% !important;
                    padding: 12px 16px !important;
                    border: 2px solid #444444 !important;
                    border-radius: 8px !important;
                    font-size: 14px !important;
                    transition: border-color 0.3s ease !important;
                    background: #2d2d2d !important;
                    color: #ffffff !important;
                }
                
                .image-settings-form-group input:focus,
                .image-settings-form-group select:focus,
                .image-settings-form-group textarea:focus {
                    outline: none !important;
                    border-color: #007acc !important;
                    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2) !important;
                }
                
                .image-settings-form-button {
                    background: linear-gradient(135deg, #007acc 0%, #005a9e 100%) !important;
                    color: white !important;
                    border: none !important;
                    padding: 14px 28px !important;
                    border-radius: 8px !important;
                    font-size: 16px !important;
                    font-weight: 600 !important;
                    cursor: pointer !important;
                    transition: transform 0.2s ease !important;
                    width: 100% !important;
                    margin-bottom: 15px !important;
                }
                
                .image-settings-form-button:hover {
                    transform: translateY(-2px) !important;
                }
                
                .image-settings-section-title {
                    font-size: 20px !important;
                    font-weight: 600 !important;
                    color: #ffffff !important;
                    margin-bottom: 20px !important;
                    margin-top: 30px !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 10px !important;
                }
                
                .image-settings-section-divider {
                    border: none !important;
                    height: 1px !important;
                    background: linear-gradient(90deg, transparent, #444444, transparent) !important;
                    margin: 30px 0 !important;
                }
                
                .image-settings-info-box {
                    background: #2d2d2d !important;
                    border-left: 4px solid #007acc !important;
                    padding: 15px !important;
                    border-radius: 8px !important;
                    margin-bottom: 20px !important;
                    color: #ffffff !important;
                    border: 1px solid #333333 !important;
                }
                
                .image-settings-checkbox-group {
                    display: flex !important;
                    align-items: center !important;
                    gap: 10px !important;
                }
                
                .image-settings-checkbox-group input[type="checkbox"] {
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    width: 18px !important;
                    height: 18px !important;
                    border: 2px solid #444444 !important;
                    border-radius: 3px !important;
                    background-color: #2d2d2d !important;
                    cursor: pointer !important;
                    position: relative !important;
                    margin: 0 !important;
                }
                
                .image-settings-checkbox-group input[type="checkbox"]:checked {
                    background-color: #2d2d2d !important;
                    border-color: #444444 !important;
                }
                
                .image-settings-checkbox-group input[type="checkbox"]:checked::after {
                    content: '✓' !important;
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    color: white !important;
                    font-size: 14px !important;
                    font-weight: bold !important;
                    line-height: 1 !important;
                }
                
                .image-settings-checkbox-group label {
                    margin: 0 !important;
                    cursor: pointer !important;
                    color: #ffffff !important;
                }
                
                .image-settings-form-help {
                    font-size: 12px !important;
                    color: #cccccc !important;
                    margin-top: 5px !important;
                    line-height: 1.4 !important;
                }
                
                .image-settings-status-display {
                    margin-top: 20px !important;
                    padding: 15px !important;
                    background: rgba(0, 0, 0, 0.7) !important;
                    border-radius: 8px !important;
                    display: none !important;
                    align-items: center !important;
                    gap: 10px !important;
                    color: #ffffff !important;
                    border: 1px solid rgba(255, 255, 255, 0.3) !important;
                    transition: opacity 0.3s ease !important;
                    opacity: 1 !important;
                    z-index: 1000 !important;
                    min-height: 50px !important;
                }
                
                .image-settings-status-indicator {
                    display: inline-block !important;
                    width: 12px !important;
                    height: 12px !important;
                    border-radius: 50% !important;
                    margin-right: 8px !important;
                    flex-shrink: 0 !important;
                    animation: statusPulse 2s ease-in-out infinite !important;
                }
                
                @keyframes statusPulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.1); }
                }
                
                .image-settings-status-indicator.success {
                    background: #4ade80 !important;
                    box-shadow: 0 0 12px rgba(74, 222, 128, 0.8), 0 0 20px rgba(74, 222, 128, 0.4) !important;
                }
                
                .image-settings-status-indicator.warning {
                    background: #f59e0b !important;
                    box-shadow: 0 0 12px rgba(245, 158, 11, 0.8), 0 0 20px rgba(245, 158, 11, 0.4) !important;
                }
                
                .image-settings-status-indicator.error {
                    background: #ef4444 !important;
                    box-shadow: 0 0 12px rgba(239, 68, 68, 0.8), 0 0 20px rgba(239, 68, 68, 0.4) !important;
                }
                
                @media (max-width: 768px) {
                    .image-settings-content {
                        padding: 20px !important;
                    }
                    
                    .image-settings-header {
                        padding: 20px !important;
                    }
                    
                    .image-settings-header h1 {
                        font-size: 24px !important;
                    }
                }
            `;
        },

        /**
         * 获取面板HTML
         */
        getPanelHTML() {
            return `
                <div class="image-settings-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h1>🎨 图片生成设置</h1>
                        <p>管理所有面板的图片生成功能</p>
                    </div>
                    <button id="close-image-settings-panel" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #444444; color: white; width: 35px; height: 35px; border-radius: 6px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">&times;</button>
                </div>
                
                <div class="image-settings-content">
                    <div class="image-settings-info-box">
                        <h4 style="margin: 0 0 10px 0;">📋 支援的面板</h4>
                        <p style="margin: 5px 0;">為每個面板選擇圖片生成服務：</p>
                        <p style="margin: 5px 0;"><strong>🆓 Pollinations</strong> - 免費，質量一般</p>
                        <p style="margin: 5px 0 0 0;"><strong>💰 NovelAI</strong> - 付費，需要 API Token，質量較好</p>
                    </div>

                    <!-- 🔥 統一控制：Echo/Chat/Forum 面板 -->
                    <div class="image-settings-form-group" style="background: #2d2d2d; padding: 15px; border-radius: 8px; border: 1px solid #444444; margin-bottom: 20px;">
                        <div class="image-settings-checkbox-group" style="margin-bottom: 15px;">
                            <input type="checkbox" id="unified-echo-chat-forum-enable">
                            <label for="unified-echo-chat-forum-enable" style="font-weight: 600; font-size: 15px;">啟用 Echo/Chat/Forum 圖片生成</label>
                        </div>
                        <label for="unified-echo-chat-forum-service" style="display: block; margin-bottom: 10px; font-weight: 600; color: #ffffff; font-size: 14px;">圖片生成服務</label>
                        <select id="unified-echo-chat-forum-service" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #2d2d2d; color: #ffffff;">
                            <option value="pollinations">Pollinations (免費)</option>
                            <option value="novelai">NovelAI (付費)</option>
                        </select>
                        <div class="image-settings-form-help" style="margin-top: 8px; color: rgba(255, 255, 255, 0.7);">
                            統一控制 Echo、Chat、Forum 三個面板的圖片生成功能和服務選擇
                        </div>
                    </div>

                    <!-- VN 面板设置 -->
                    <div class="image-settings-form-group">
                        <div class="image-settings-checkbox-group">
                            <input type="checkbox" id="enable-vn-image">
                            <label for="enable-vn-image">啟用 VN 面板圖片生成</label>
                        </div>
                        <select id="vn-image-service" style="margin-top: 10px; width: 100%;">
                            <option value="pollinations">Pollinations (免費)</option>
                            <option value="novelai">NovelAI (付費)</option>
                        </select>
                    </div>

                    <!-- Avatar 头像生成设置 -->
                    <div class="image-settings-form-group" style="background: #2d2d2d; padding: 15px; border-radius: 8px; border: 1px solid #444444; margin-bottom: 20px;">
                        <label for="avatar-image-service" style="display: block; margin-bottom: 10px; font-weight: 600; color: #ffffff; font-size: 15px;">📷 Avatar 頭像生成服務</label>
                        <select id="avatar-image-service" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #2d2d2d; color: #ffffff;">
                            <option value="pollinations">Pollinations (免費)</option>
                            <option value="novelai">NovelAI (付費)</option>
                        </select>
                        <div class="image-settings-form-help" style="margin-top: 8px; color: rgba(255, 255, 255, 0.7);">
                            用於生成 [Avatar:角色名;ENG_PROMPT] 格式的角色頭像
                        </div>
                    </div>

                    <!-- NovelAI 设置 -->
                    <div class="image-settings-section-divider"></div>
                    <div class="image-settings-section-title">💰 NovelAI 設置</div>
                    
                    <div class="image-settings-form-group">
                        <label for="novelai-token">NovelAI API Token</label>
                        <input type="password" id="novelai-token" placeholder="輸入你的 NovelAI API Token">
                        <div class="image-settings-form-help">💡 需要付費訂閱 NovelAI 才能使用</div>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-model">模型</label>
                        <select id="novelai-model">
                            <option value="nai-diffusion-4-5-full">nai-diffusion-4-5-full (推薦)</option>
                            <option value="nai-diffusion-3-inpainting">nai-diffusion-3-inpainting</option>
                        </select>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-size">圖片尺寸</label>
                        <select id="novelai-size">
                            <option value="512x512">512x512</option>
                            <option value="640x640">640x640</option>
                            <option value="832x1216">832x1216 (豎版)</option>
                            <option value="1216x832">1216x832 (橫版)</option>
                        </select>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-steps">生成步數</label>
                        <input type="number" id="novelai-steps" min="1" max="50" value="28">
                        <div class="image-settings-form-help">💡 步數越多質量越好，但生成時間更長</div>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-scale">CFG Scale</label>
                        <input type="number" id="novelai-scale" min="1" max="20" step="0.5" value="5">
                        <div class="image-settings-form-help">💡 控制提示詞的影響強度</div>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-sampler">採樣器</label>
                        <select id="novelai-sampler">
                            <option value="k_euler_ancestral">k_euler_ancestral (推薦)</option>
                            <option value="k_euler">k_euler</option>
                            <option value="k_lms">k_lms</option>
                            <option value="plms">plms</option>
                            <option value="ddim">ddim</option>
                        </select>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-positive-prompt">正面提示詞（質量標籤）</label>
                        <textarea id="novelai-positive-prompt" rows="3" placeholder="masterpiece, best quality, amazing quality, very aesthetic, absurdres">masterpiece, best quality, amazing quality, very aesthetic, absurdres</textarea>
                        <div class="image-settings-form-help">💡 這些標籤會自動追加到 AI 提供的提示詞後面</div>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-negative-prompt">負面提示詞</label>
                        <textarea id="novelai-negative-prompt" rows="3" placeholder="lowres, bad anatomy, bad hands, text, error...">lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry</textarea>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="novelai-cors-proxy">CORS 代理</label>
                        <select id="novelai-cors-proxy">
                            <option value="">不使用代理</option>
                            <option value="corsproxy.io" selected>corsproxy.io</option>
                            <option value="allorigins.win">allorigins.win</option>
                            <option value="custom">自定義代理</option>
                        </select>
                    </div>

                    <div class="image-settings-form-group" id="novelai-custom-proxy-group" style="display: none;">
                        <label for="novelai-custom-proxy-url">自定義代理 URL</label>
                        <input type="text" id="novelai-custom-proxy-url" placeholder="https://your-proxy.com/?">
                    </div>

                    <!-- 角色提示词列表 -->
                    <div class="image-settings-section-divider"></div>
                    <div class="image-settings-section-title">👤 角色提示詞列表</div>
                    
                    <div class="image-settings-form-group">
                        <button id="open-character-prompt-list-btn" class="image-settings-form-button" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">
                            📝 打開角色提示詞列表
                        </button>
                        <div class="image-settings-form-help" style="margin-top: 5px; font-size: 12px; color: rgba(255, 255, 255, 0.6);">
                            💡 為角色配置專屬的形象提示詞，生成圖片時會自動拼接
                        </div>
                    </div>

                    <!-- Pollinations 设置 -->
                    <div class="image-settings-section-divider"></div>
                    <div class="image-settings-section-title">🆓 Pollinations 設置</div>
                    
                    <div class="image-settings-form-group">
                        <label for="pollinations-model">模型</label>
                        <select id="pollinations-model">
                            <option value="flux" selected>⭐ FLUX (推薦模型, 生成速度快, 品質優秀)</option>
                            <option value="kontext">Kontext (適合複雜場景和細節豐富的圖像)</option>
                            <option value="turbo">Turbo (超快速生成, 適合快速測試和迭代)</option>
                        </select>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="pollinations-size">圖片尺寸</label>
                        <select id="pollinations-size">
                            <option value="512x512" selected>512x512</option>
                            <option value="768x768">768x768</option>
                            <option value="1024x1024">1024x1024</option>
                        </select>
                    </div>

                    <div class="image-settings-form-group">
                        <label for="pollinations-default-prompt">默認提示詞（風格）</label>
                        <textarea id="pollinations-default-prompt" rows="4" placeholder="manhwa illustration style, acrylic painting texture...">manhwa illustration style, acrylic painting texture, detailed anime-inspired illustration, trending illustration, fashionable illustrations, flat illustrations, rich in detail, dramatic light and shadow contrasts. delicate gradients, Mucha-inspired color scheme. 8K quality with excellent lighting and shadows.</textarea>
                        <div class="image-settings-form-help">💡 這個提示詞會自動追加到角色描述後面</div>
                    </div>

                    <!-- 保存按钮 -->
                    <div class="image-settings-section-divider"></div>
                    <div style="display: flex; align-items: center; gap: 15px; margin-top: 20px;">
                        <button class="image-settings-form-button" id="save-image-settings-btn" style="flex: 1;">保存圖片生成設置</button>
                        <div id="image-status-display" class="image-settings-status-display" style="flex: 1; margin-top: 0 !important; display: none;">
                            <div class="image-settings-status-indicator success"></div>
                            <span id="image-status-text">設置已保存</span>
                        </div>
                    </div>
                </div>
            `;
        },

        /**
         * 初始化面板事件監聽器
         */
        async initializePanel() {
            try {
                // 延迟加载图片生成设置（等待管理器加载）
                setTimeout(() => {
                    this.loadImageGeneratorSettings();
                }, 500);
                
                // 设置事件监听器
                this.setupImageGeneratorListeners();
                
                logger.info('图片设置面板初始化完成');
            } catch (error) {
                logger.error('初始化面板失敗: ' + error.message);
                this.showErrorNotification('初始化失敗: ' + error.message);
            }
        },

        /**
         * 设置图片生成事件监听器
         */
        setupImageGeneratorListeners() {
            const self = this;
            
            // 如果没有图片生成管理器，等待加载
            if (!window.ImageGeneratorManager) {
                logger.warn('图片生成管理器未加载，稍后重试');
                setTimeout(() => this.setupImageGeneratorListeners(), 1000);
                return;
            }
            
            const imgManager = window.ImageGeneratorManager;
            
            // 加载图片生成设置
            this.loadImageGeneratorSettings();
            
            // 🔥 統一控制：Echo/Chat/Forum 面板（复选框 + 下拉菜单）
            const unifiedCheckbox = document.getElementById('unified-echo-chat-forum-enable');
            const unifiedServiceSelect = document.getElementById('unified-echo-chat-forum-service');
            
            // 更新三個面板的設置
            const updateUnifiedPanels = () => {
                const enabled = unifiedCheckbox ? unifiedCheckbox.checked : false;
                const service = unifiedServiceSelect ? unifiedServiceSelect.value : 'pollinations';
                const panels = ['echo', 'chat', 'forum'];
                panels.forEach(panel => {
                    imgManager.updatePanelSettings(panel, enabled, service);
                });
            };
            
            if (unifiedCheckbox) {
                unifiedCheckbox.addEventListener('change', updateUnifiedPanels);
            }
            
            if (unifiedServiceSelect) {
                unifiedServiceSelect.addEventListener('change', updateUnifiedPanels);
            }
            
            // VN 面板等其他面板正常处理
            const vnEnableCheckbox = document.getElementById('enable-vn-image');
            const vnServiceSelect = document.getElementById('vn-image-service');

            if (vnEnableCheckbox) {
                vnEnableCheckbox.addEventListener('change', function() {
                    const service = vnServiceSelect ? vnServiceSelect.value : 'pollinations';
                    imgManager.updatePanelSettings('vn', this.checked, service);
                });
            }

            if (vnServiceSelect) {
                vnServiceSelect.addEventListener('change', function() {
                    const enabled = vnEnableCheckbox ? vnEnableCheckbox.checked : false;
                    imgManager.updatePanelSettings('vn', enabled, this.value);
                });
            }

            // Avatar 头像生成服务选择器
            const avatarServiceSelect = document.getElementById('avatar-image-service');
            if (avatarServiceSelect) {
                avatarServiceSelect.addEventListener('change', function() {
                    imgManager.updatePanelSettings('avatar', true, this.value);
                });
            }
            
            // NovelAI 设置
            const novelaiTokenInput = document.getElementById('novelai-token');
            if (novelaiTokenInput) {
                novelaiTokenInput.addEventListener('input', function() {
                    imgManager.state.novelai.token = this.value;
                });
            }
            
            const novelaiModelSelect = document.getElementById('novelai-model');
            if (novelaiModelSelect) {
                novelaiModelSelect.addEventListener('change', function() {
                    imgManager.state.novelai.settings.model = this.value;
                });
            }
            
            const novelaiSizeSelect = document.getElementById('novelai-size');
            if (novelaiSizeSelect) {
                novelaiSizeSelect.addEventListener('change', function() {
                    const [width, height] = this.value.split('x').map(Number);
                    imgManager.state.novelai.settings.size = { width, height };
                });
            }
            
            const novelaiStepsInput = document.getElementById('novelai-steps');
            if (novelaiStepsInput) {
                novelaiStepsInput.addEventListener('input', function() {
                    imgManager.state.novelai.settings.steps = parseInt(this.value) || 28;
                });
            }
            
            const novelaiScaleInput = document.getElementById('novelai-scale');
            if (novelaiScaleInput) {
                novelaiScaleInput.addEventListener('input', function() {
                    imgManager.state.novelai.settings.scale = parseFloat(this.value) || 5;
                });
            }
            
            const novelaiSamplerSelect = document.getElementById('novelai-sampler');
            if (novelaiSamplerSelect) {
                novelaiSamplerSelect.addEventListener('change', function() {
                    imgManager.state.novelai.settings.sampler = this.value;
                });
            }
            
            const novelaiPositivePrompt = document.getElementById('novelai-positive-prompt');
            if (novelaiPositivePrompt) {
                novelaiPositivePrompt.addEventListener('input', function() {
                    imgManager.state.novelai.settings.positivePrompt = this.value;
                });
            }
            
            const novelaiNegativePrompt = document.getElementById('novelai-negative-prompt');
            if (novelaiNegativePrompt) {
                novelaiNegativePrompt.addEventListener('input', function() {
                    imgManager.state.novelai.settings.negativePrompt = this.value;
                });
            }
            
            const novelaiCorsProxy = document.getElementById('novelai-cors-proxy');
            const novelaiCustomProxyGroup = document.getElementById('novelai-custom-proxy-group');
            const novelaiCustomProxyUrl = document.getElementById('novelai-custom-proxy-url');
            
            if (novelaiCorsProxy) {
                novelaiCorsProxy.addEventListener('change', function() {
                    imgManager.state.novelai.settings.corsProxy = this.value;
                    if (novelaiCustomProxyGroup) {
                        novelaiCustomProxyGroup.style.display = this.value === 'custom' ? 'block' : 'none';
                    }
                });
            }
            
            if (novelaiCustomProxyUrl) {
                novelaiCustomProxyUrl.addEventListener('input', function() {
                    imgManager.state.novelai.settings.customProxyUrl = this.value;
                });
            }
            
            // Pollinations 设置
            const pollinationsModelSelect = document.getElementById('pollinations-model');
            if (pollinationsModelSelect) {
                pollinationsModelSelect.addEventListener('change', function() {
                    imgManager.state.pollinations.defaultModel = this.value;
                });
            }
            
            const pollinationsSizeSelect = document.getElementById('pollinations-size');
            if (pollinationsSizeSelect) {
                pollinationsSizeSelect.addEventListener('change', function() {
                    imgManager.state.pollinations.defaultSize = this.value;
                });
            }
            
            const pollinationsDefaultPrompt = document.getElementById('pollinations-default-prompt');
            if (pollinationsDefaultPrompt) {
                pollinationsDefaultPrompt.addEventListener('input', function() {
                    imgManager.state.pollinations.defaultPrompt = this.value;
                });
            }
            
            // 保存图片生成设置
            const saveImageSettingsBtn = document.getElementById('save-image-settings-btn');
            if (saveImageSettingsBtn) {
                saveImageSettingsBtn.addEventListener('click', async function() {
                    const originalText = this.textContent;
                    const originalBg = this.style.background;

                    try {
                        // 显示保存中状态
                        this.textContent = '⏳ 保存中...';
                        this.style.background = '#6c757d';
                        this.disabled = true;

                        await imgManager.saveSettings();

                        // 显示成功状态
                        this.textContent = '✅ 保存成功！';
                        this.style.background = '#28a745';
                        self.showImageStatus('圖片生成設置已保存', 'success');
                        logger.info('圖片生成設置已保存');

                        // 2秒后恢复原状
                        setTimeout(() => {
                            this.textContent = originalText;
                            this.style.background = originalBg || 'linear-gradient(135deg, #007acc 0%, #005a9e 100%)';
                            this.disabled = false;
                        }, 2000);
                    } catch (error) {
                        logger.error('保存圖片生成設置失敗:', error);

                        // 显示失败状态
                        this.textContent = '❌ 保存失敗';
                        this.style.background = '#dc3545';
                        self.showImageStatus('保存失敗: ' + error.message, 'error');

                        // 3秒后恢复原状
                        setTimeout(() => {
                            this.textContent = originalText;
                            this.style.background = originalBg || 'linear-gradient(135deg, #007acc 0%, #005a9e 100%)';
                            this.disabled = false;
                        }, 3000);
                    }
                });
            }
            
            // 🔥 新增：角色提示词列表按钮事件
            const openCharacterPromptListBtn = document.getElementById('open-character-prompt-list-btn');
            if (openCharacterPromptListBtn) {
                openCharacterPromptListBtn.addEventListener('click', () => {
                    this.showCharacterPromptListModal();
                });
            }
        },

        /**
         * 加载图片生成设置
         */
        loadImageGeneratorSettings() {
            if (!window.ImageGeneratorManager) return;
            
            const imgManager = window.ImageGeneratorManager;
            const state = imgManager.state;
            
            // 🔥 加载统一控制设置（Echo/Chat/Forum）
            const unifiedCheckbox = document.getElementById('unified-echo-chat-forum-enable');
            const unifiedServiceSelect = document.getElementById('unified-echo-chat-forum-service');
            
            if (unifiedCheckbox && unifiedServiceSelect) {
                // 检查三个面板的启用状态（如果都启用，复选框选中）
                const echoEnabled = state.panelSettings.echo?.enabled || false;
                const chatEnabled = state.panelSettings.chat?.enabled || false;
                const forumEnabled = state.panelSettings.forum?.enabled || false;
                unifiedCheckbox.checked = echoEnabled && chatEnabled && forumEnabled;
                
                // 使用第一个面板的服务设置（三个面板应该一致）
                const service = state.panelSettings.echo?.service || 
                               state.panelSettings.chat?.service || 
                               state.panelSettings.forum?.service || 
                               'pollinations';
                unifiedServiceSelect.value = service;
            }
            
            // 加载 VN 面板设置
            const vnPanelSetting = state.panelSettings.vn;
            if (vnPanelSetting) {
                const vnEnableCheckbox = document.getElementById('enable-vn-image');
                const vnServiceSelect = document.getElementById('vn-image-service');

                if (vnEnableCheckbox) {
                    vnEnableCheckbox.checked = vnPanelSetting.enabled;
                }
                if (vnServiceSelect && vnPanelSetting.service) {
                    vnServiceSelect.value = vnPanelSetting.service;
                }
            }

            // 加载 Avatar 头像生成设置
            const avatarPanelSetting = state.panelSettings.avatar;
            if (avatarPanelSetting) {
                const avatarServiceSelect = document.getElementById('avatar-image-service');
                if (avatarServiceSelect && avatarPanelSetting.service) {
                    avatarServiceSelect.value = avatarPanelSetting.service;
                }
            }
            
            // 加载 NovelAI 设置
            const novelaiSettings = state.novelai.settings;
            const novelaiTokenInput = document.getElementById('novelai-token');
            if (novelaiTokenInput && state.novelai.token) {
                novelaiTokenInput.value = state.novelai.token;
            }
            
            const novelaiModelSelect = document.getElementById('novelai-model');
            if (novelaiModelSelect && novelaiSettings.model) {
                novelaiModelSelect.value = novelaiSettings.model;
            }
            
            const novelaiSizeSelect = document.getElementById('novelai-size');
            if (novelaiSizeSelect && novelaiSettings.size) {
                novelaiSizeSelect.value = `${novelaiSettings.size.width}x${novelaiSettings.size.height}`;
            }
            
            const novelaiStepsInput = document.getElementById('novelai-steps');
            if (novelaiStepsInput && novelaiSettings.steps) {
                novelaiStepsInput.value = novelaiSettings.steps;
            }
            
            const novelaiScaleInput = document.getElementById('novelai-scale');
            if (novelaiScaleInput && novelaiSettings.scale) {
                novelaiScaleInput.value = novelaiSettings.scale;
            }
            
            const novelaiSamplerSelect = document.getElementById('novelai-sampler');
            if (novelaiSamplerSelect && novelaiSettings.sampler) {
                novelaiSamplerSelect.value = novelaiSettings.sampler;
            }
            
            const novelaiPositivePrompt = document.getElementById('novelai-positive-prompt');
            if (novelaiPositivePrompt && novelaiSettings.positivePrompt) {
                novelaiPositivePrompt.value = novelaiSettings.positivePrompt;
            }
            
            const novelaiNegativePrompt = document.getElementById('novelai-negative-prompt');
            if (novelaiNegativePrompt && novelaiSettings.negativePrompt) {
                novelaiNegativePrompt.value = novelaiSettings.negativePrompt;
            }
            
            const novelaiCorsProxy = document.getElementById('novelai-cors-proxy');
            const novelaiCustomProxyGroup = document.getElementById('novelai-custom-proxy-group');
            const novelaiCustomProxyUrl = document.getElementById('novelai-custom-proxy-url');
            
            if (novelaiCorsProxy && novelaiSettings.corsProxy) {
                novelaiCorsProxy.value = novelaiSettings.corsProxy;
                if (novelaiCustomProxyGroup) {
                    novelaiCustomProxyGroup.style.display = novelaiSettings.corsProxy === 'custom' ? 'block' : 'none';
                }
            }
            
            if (novelaiCustomProxyUrl && novelaiSettings.customProxyUrl) {
                novelaiCustomProxyUrl.value = novelaiSettings.customProxyUrl;
            }
            
            // 加载 Pollinations 设置
            const pollinationsModelSelect = document.getElementById('pollinations-model');
            if (pollinationsModelSelect && state.pollinations.defaultModel) {
                pollinationsModelSelect.value = state.pollinations.defaultModel;
            }
            
            const pollinationsSizeSelect = document.getElementById('pollinations-size');
            if (pollinationsSizeSelect && state.pollinations.defaultSize) {
                pollinationsSizeSelect.value = state.pollinations.defaultSize;
            }
            
            const pollinationsDefaultPrompt = document.getElementById('pollinations-default-prompt');
            if (pollinationsDefaultPrompt && state.pollinations.defaultPrompt) {
                pollinationsDefaultPrompt.value = state.pollinations.defaultPrompt;
            }
        },

        /**
         * 显示状态消息
         */
        showImageStatus(message, type = 'success') {
            const statusDisplay = document.getElementById('image-status-display');
            const statusText = document.getElementById('image-status-text');
            const statusIndicator = statusDisplay?.querySelector('.image-settings-status-indicator');
            
            if (statusDisplay && statusText && statusIndicator) {
                statusText.textContent = message;
                statusIndicator.className = `image-settings-status-indicator ${type}`;
                statusDisplay.style.display = 'flex';
                
                setTimeout(() => {
                    statusDisplay.style.display = 'none';
                }, 3000);
            }
        },

        /**
         * 显示错误通知
         */
        showErrorNotification(message) {
            // 简单的错误提示
            alert(message);
        },

        /**
         * 🔥 新增：显示角色提示词列表窗口
         */
        showCharacterPromptListModal() {
            // 创建模态窗口
            let modal = document.getElementById('character-prompt-list-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'character-prompt-list-modal';
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(0, 0, 0, 0.7);
                    z-index: 999999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    box-sizing: border-box;
                `;
                
                modal.innerHTML = `
                    <div style="background: #1a1a1a; border-radius: 12px; width: min(800px, 90vw); max-height: calc(100vh - 40px); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid #333333;">
                        <div style="background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%); color: white; padding: 30px; border-bottom: 1px solid #333333; display: flex; justify-content: space-between; align-items: center; border-radius: 12px 12px 0 0;">
                            <h2 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">👤 角色提示詞列表</h2>
                            <button id="close-character-prompt-list-modal" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #444444; color: white; width: 35px; height: 35px; border-radius: 6px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">&times;</button>
                        </div>
                        <div style="flex: 1; overflow-y: auto; padding: 40px; background: #1a1a1a; color: #ffffff;">
                            <div style="margin-bottom: 25px;">
                                <button id="add-character-prompt-btn" class="image-settings-form-button" style="width: auto; margin-bottom: 0;">
                                    ➕ 添加角色提示詞
                                </button>
                            </div>
                            <div id="character-prompt-list-container" style="display: flex; flex-direction: column; gap: 15px;">
                                <!-- 角色提示词条目将在这里动态添加 -->
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // 🔥 新增：添加/编辑角色提示词的弹出窗口（独立于列表窗口）
                let editModal = document.getElementById('character-prompt-edit-modal');
                if (!editModal) {
                    editModal = document.createElement('div');
                    editModal.id = 'character-prompt-edit-modal';
                    editModal.style.cssText = 'display: none; position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0, 0, 0, 0.8) !important; z-index: 9999999999 !important; align-items: center !important; justify-content: center !important; padding: 0 !important; margin: 0 !important;';
                    
                    editModal.innerHTML = `
                        <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border: 2px solid #444444; border-radius: 12px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);">
                            <div style="padding: 25px; border-bottom: 1px solid #444444; display: flex; justify-content: space-between; align-items: center;">
                                <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #ffffff;" id="character-prompt-edit-modal-title">➕ 添加角色提示詞</h2>
                                <button id="close-character-prompt-edit-modal" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #444444; color: white; width: 35px; height: 35px; border-radius: 6px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">&times;</button>
                            </div>
                            <div style="padding: 30px;">
                                <div class="image-settings-form-group" style="display: flex; flex-direction: column; gap: 20px;">
                                    <div class="image-settings-form-group">
                                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #ffffff; font-size: 14px;">Keyname (角色名) *</label>
                                        <input type="text" id="edit-modal-keyname" placeholder="例如: 米拉" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #2d2d2d; color: #ffffff; transition: border-color 0.3s ease;">
                                    </div>
                                    <div class="image-settings-form-group">
                                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #ffffff; font-size: 14px;">角色形象提示詞 *</label>
                                        <textarea id="edit-modal-prompt" rows="6" placeholder="例如: young man with dark hair, wearing headphones, focused expression" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; resize: vertical; background: #2d2d2d; color: #ffffff; transition: border-color 0.3s ease; font-family: inherit;"></textarea>
                                    </div>
                                    <div class="image-settings-form-group">
                                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #ffffff; font-size: 14px;">映射別名 Keyname (可選，多個用逗號分隔)</label>
                                        <input type="text" id="edit-modal-aliases" placeholder="例如: 米拉, 小米" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #2d2d2d; color: #ffffff; transition: border-color 0.3s ease;">
                                        <div class="image-settings-form-help" style="font-size: 12px; color: #cccccc; margin-top: 5px;">💡 如果角色有多個名稱，可以在這裡添加，用逗號分隔</div>
                                    </div>
                                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                                        <button id="cancel-edit-modal-btn" class="image-settings-form-button" style="width: auto; margin-bottom: 0; padding: 10px 20px; background: #6c757d;">取消</button>
                                        <button id="save-edit-modal-btn" class="image-settings-form-button" style="width: auto; margin-bottom: 0; padding: 10px 20px; background: #28a745;">💾 保存</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    document.body.appendChild(editModal);
                }
                
                document.body.appendChild(modal);
                
                // 关闭按钮事件
                const closeBtn = document.getElementById('close-character-prompt-list-modal');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        modal.style.display = 'none';
                    });
                    closeBtn.addEventListener('mouseenter', () => {
                        closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                        closeBtn.style.borderColor = '#007acc';
                    });
                    closeBtn.addEventListener('mouseleave', () => {
                        closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                        closeBtn.style.borderColor = '#444444';
                    });
                }
                
                // 点击背景关闭
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.style.display = 'none';
                    }
                });
                
                // 添加按钮事件 - 打开弹出窗口
                const addBtn = document.getElementById('add-character-prompt-btn');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        this.showCharacterPromptEditModal();
                    });
                }
                
                // 🔥 新增：弹出窗口关闭按钮
                const closeEditModalBtn = document.getElementById('close-character-prompt-edit-modal');
                const cancelEditModalBtn = document.getElementById('cancel-edit-modal-btn');
                if (closeEditModalBtn) {
                    closeEditModalBtn.addEventListener('click', () => {
                        this.hideCharacterPromptEditModal();
                    });
                }
                if (cancelEditModalBtn) {
                    cancelEditModalBtn.addEventListener('click', () => {
                        this.hideCharacterPromptEditModal();
                    });
                }
                
                // 🔥 新增：弹出窗口保存按钮
                const saveEditModalBtn = document.getElementById('save-edit-modal-btn');
                if (saveEditModalBtn) {
                    saveEditModalBtn.addEventListener('click', async () => {
                        await this.saveFromEditModal();
                    });
                }
                
                // 🔥 新增：点击背景关闭窗口
                const editModalEl = document.getElementById('character-prompt-edit-modal');
                if (editModalEl) {
                    editModalEl.addEventListener('click', (e) => {
                        if (e.target === editModalEl) {
                            this.hideCharacterPromptEditModal();
                        }
                    });
                }
            }
            
            modal.style.display = 'flex';
            this.loadCharacterPromptList();
        },
        
        /**
         * 🔥 新增：添加角色提示词条目（列表形式，默认收起）
         */
        addCharacterPromptItem(item = null) {
            const container = document.getElementById('character-prompt-list-container');
            if (!container) return;
            
            const itemId = item ? item.id : Date.now().toString();
            const isNew = !item;
            const itemDiv = document.createElement('div');
            itemDiv.id = `character-prompt-item-${itemId}`;
            itemDiv.className = 'character-prompt-item';
            itemDiv.style.cssText = `
                background: #2d2d2d;
                border: 1px solid #444444;
                border-radius: 8px;
                margin-bottom: 15px;
                overflow: hidden;
                transition: all 0.3s ease;
            `;
            
            // 预览部分（默认显示）
            const previewHtml = `
                <div class="character-prompt-preview" style="padding: 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s ease;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #ffffff; font-size: 16px; margin-bottom: 8px;">
                            <span class="character-prompt-keyname-display">${item ? (item.keyname || '') : '新角色'}</span>
                            ${item && item.aliases ? `<span class="alias-display" style="color: #cccccc; font-size: 12px; margin-left: 10px;">(${item.aliases})</span>` : ''}
                        </div>
                        <div style="color: #cccccc; font-size: 13px; max-height: 40px; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">
                            <span class="character-prompt-preview-text">${item ? (item.prompt ? item.prompt.substring(0, 80) + '...' : '未設置提示詞') : '點擊展開編輯'}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="edit-character-prompt-btn image-settings-form-button" data-id="${itemId}" style="width: auto; margin-bottom: 0; padding: 8px 16px; font-size: 13px; background: linear-gradient(135deg, #007acc 0%, #005a9e 100%);">✏️ 編輯</button>
                        <button class="delete-character-prompt-btn" data-id="${itemId}" style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease;">🗑️ 刪除</button>
                    </div>
                </div>
            `;
            
            // 编辑部分（默认隐藏，点击展开）
            const editHtml = `
                <div class="character-prompt-edit" style="display: ${isNew ? 'block' : 'none'}; padding: 20px; border-top: 1px solid #444444; background: #1a1a1a;">
                    <div class="image-settings-form-group" style="display: flex; flex-direction: column; gap: 20px;">
                        <div class="image-settings-form-group">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #ffffff; font-size: 14px;">Keyname (角色名) *</label>
                            <input type="text" class="character-prompt-keyname" data-id="${itemId}" value="${item ? (item.keyname || '') : ''}" placeholder="例如: 米拉" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #2d2d2d; color: #ffffff; transition: border-color 0.3s ease;">
                        </div>
                        <div class="image-settings-form-group">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #ffffff; font-size: 14px;">角色形象提示詞 *</label>
                            <textarea class="character-prompt-prompt" data-id="${itemId}" rows="4" placeholder="例如: young man with dark hair, wearing headphones, focused expression" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; resize: vertical; background: #2d2d2d; color: #ffffff; transition: border-color 0.3s ease; font-family: inherit;">${item ? (item.prompt || '') : ''}</textarea>
                        </div>
                        <div class="image-settings-form-group">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #ffffff; font-size: 14px;">映射別名 Keyname (可選，多個用逗號分隔)</label>
                            <input type="text" class="character-prompt-aliases" data-id="${itemId}" value="${item ? (item.aliases || '') : ''}" placeholder="例如: 米拉, 小米" style="width: 100%; padding: 12px 16px; border: 2px solid #444444; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #2d2d2d; color: #ffffff; transition: border-color 0.3s ease;">
                            <div class="image-settings-form-help" style="font-size: 12px; color: #cccccc; margin-top: 5px;">💡 如果角色有多個名稱，可以在這裡添加，用逗號分隔</div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                            <button class="cancel-character-prompt-btn image-settings-form-button" data-id="${itemId}" style="width: auto; margin-bottom: 0; padding: 10px 20px; background: #6c757d;">取消</button>
                            <button class="save-character-prompt-btn image-settings-form-button" data-id="${itemId}" style="width: auto; margin-bottom: 0; padding: 10px 20px; background: #28a745;">💾 保存</button>
                        </div>
                    </div>
                </div>
            `;
            
            itemDiv.innerHTML = previewHtml + editHtml;
            container.appendChild(itemDiv);
            
            // 预览区域点击展开/收起
            const previewDiv = itemDiv.querySelector('.character-prompt-preview');
            const editDiv = itemDiv.querySelector('.character-prompt-edit');
            if (previewDiv && editDiv) {
                previewDiv.addEventListener('click', (e) => {
                    // 如果点击的是按钮，不触发展开
                    if (e.target.closest('button')) return;
                    
                    const isExpanded = editDiv.style.display !== 'none';
                    editDiv.style.display = isExpanded ? 'none' : 'block';
                });
                previewDiv.addEventListener('mouseenter', () => {
                    previewDiv.style.background = '#333333';
                });
                previewDiv.addEventListener('mouseleave', () => {
                    previewDiv.style.background = 'transparent';
                });
            }
            
            // 输入框焦点样式
            const inputs = itemDiv.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                input.addEventListener('focus', function() {
                    this.style.borderColor = '#007acc';
                    this.style.boxShadow = '0 0 0 2px rgba(0, 122, 204, 0.2)';
                });
                input.addEventListener('blur', function() {
                    this.style.borderColor = '#444444';
                    this.style.boxShadow = 'none';
                });
            });
            
            // 编辑按钮事件 - 打开弹出窗口
            const editBtn = itemDiv.querySelector('.edit-character-prompt-btn');
            if (editBtn) {
                editBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    // 从数据库加载完整数据
                    try {
                        const items = await this.loadCharacterPromptsFromDB();
                        const fullItem = items.find(i => i.id === itemId);
                        if (fullItem) {
                            this.showCharacterPromptEditModal(fullItem);
                        } else {
                            // 如果数据库中没有，使用显示的数据
                            this.showCharacterPromptEditModal(item || {
                                id: itemId,
                                keyname: itemDiv.querySelector('.character-prompt-keyname-display')?.textContent || '',
                                prompt: itemDiv.querySelector('.character-prompt-preview-text')?.textContent || '',
                                aliases: itemDiv.querySelector('.alias-display')?.textContent?.replace(/[()]/g, '') || ''
                            });
                        }
                    } catch (error) {
                        logger.error('加载角色提示词失败:', error);
                        // 降级使用显示的数据
                        this.showCharacterPromptEditModal(item || {
                            id: itemId,
                            keyname: itemDiv.querySelector('.character-prompt-keyname-display')?.textContent || '',
                            prompt: itemDiv.querySelector('.character-prompt-preview-text')?.textContent || '',
                            aliases: itemDiv.querySelector('.alias-display')?.textContent?.replace(/[()]/g, '') || ''
                        });
                    }
                });
            }
            
            // 取消按钮事件
            const cancelBtn = itemDiv.querySelector('.cancel-character-prompt-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isNew) {
                        // 如果是新条目，删除整个条目
                        itemDiv.remove();
                    } else {
                        // 如果是已保存的条目，收起编辑区域
                        editDiv.style.display = 'none';
                    }
                });
            }
            
            // 保存按钮事件
            const saveBtn = itemDiv.querySelector('.save-character-prompt-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.saveCharacterPromptItem(itemId, itemDiv);
                });
            }
            
            // 删除按钮事件
            const deleteBtn = itemDiv.querySelector('.delete-character-prompt-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteCharacterPromptItem(itemId);
                });
            }
        },
        
        /**
         * 🔥 新增：保存角色提示词条目
         */
        async saveCharacterPromptItem(itemId, itemDiv = null) {
            if (!itemDiv) {
                itemDiv = document.getElementById(`character-prompt-item-${itemId}`);
            }
            if (!itemDiv) return;
            
            const keyname = itemDiv.querySelector('.character-prompt-keyname')?.value.trim();
            const prompt = itemDiv.querySelector('.character-prompt-prompt')?.value.trim();
            const aliases = itemDiv.querySelector('.character-prompt-aliases')?.value.trim();
            
            if (!keyname || !prompt) {
                alert('請填寫 Keyname 和角色形象提示詞');
                return;
            }
            
            try {
                await this.saveCharacterPromptToDB({
                    id: itemId,
                    keyname: keyname,
                    prompt: prompt,
                    aliases: aliases || ''
                });
                
                // 更新预览显示
                const keynameDisplay = itemDiv.querySelector('.character-prompt-keyname-display');
                const previewText = itemDiv.querySelector('.character-prompt-preview-text');
                if (keynameDisplay) {
                    keynameDisplay.textContent = keyname;
                }
                if (previewText) {
                    previewText.textContent = prompt.length > 80 ? prompt.substring(0, 80) + '...' : prompt;
                }
                
                // 更新别名显示
                const previewDiv = itemDiv.querySelector('.character-prompt-preview');
                if (previewDiv && aliases) {
                    let aliasSpan = previewDiv.querySelector('.alias-display');
                    if (!aliasSpan) {
                        aliasSpan = document.createElement('span');
                        aliasSpan.className = 'alias-display';
                        aliasSpan.style.cssText = 'color: #6c757d; font-size: 12px; margin-left: 10px;';
                        keynameDisplay.parentNode.insertBefore(aliasSpan, keynameDisplay.nextSibling);
                    }
                    aliasSpan.textContent = `(${aliases})`;
                } else if (previewDiv && !aliases) {
                    const aliasSpan = previewDiv.querySelector('.alias-display');
                    if (aliasSpan) aliasSpan.remove();
                }
                
                // 收起编辑区域
                const editDiv = itemDiv.querySelector('.character-prompt-edit');
                if (editDiv) {
                    editDiv.style.display = 'none';
                }
                
                // 显示成功提示
                const saveBtn = itemDiv.querySelector('.save-character-prompt-btn');
                if (saveBtn) {
                    const originalText = saveBtn.textContent;
                    saveBtn.textContent = '✅ 已保存';
                    saveBtn.style.background = '#28a745';
                    setTimeout(() => {
                        saveBtn.textContent = originalText;
                        saveBtn.style.background = '#28a745';
                    }, 2000);
                }
                
                logger.info(`角色提示詞已保存: ${keyname}`);
            } catch (error) {
                logger.error('保存角色提示詞失敗:', error);
                alert('保存失敗: ' + error.message);
            }
        },
        
        /**
         * 🔥 新增：删除角色提示词条目
         */
        async deleteCharacterPromptItem(itemId) {
            if (!confirm('確定要刪除這個角色提示詞配置嗎？')) {
                return;
            }
            
            try {
                await this.deleteCharacterPromptFromDB(itemId);
                
                const itemDiv = document.getElementById(`character-prompt-item-${itemId}`);
                if (itemDiv) {
                    itemDiv.remove();
                }
                
                logger.info(`角色提示詞已刪除: ${itemId}`);
            } catch (error) {
                logger.error('刪除角色提示詞失敗:', error);
                alert('刪除失敗: ' + error.message);
            }
        },
        
        /**
         * 🔥 新增：显示添加/编辑角色提示词的弹出窗口
         */
        showCharacterPromptEditModal(item = null) {
            const modal = document.getElementById('character-prompt-edit-modal');
            const titleEl = document.getElementById('character-prompt-edit-modal-title');
            const keynameInput = document.getElementById('edit-modal-keyname');
            const promptInput = document.getElementById('edit-modal-prompt');
            const aliasesInput = document.getElementById('edit-modal-aliases');
            
            if (!modal) return;
            
            // 🔥 参考 data_manager.js 的移动端定位逻辑
            const isMobile = window.innerWidth < 768;
            const content = modal.querySelector('div');
            
            if (content) {
                if (isMobile) {
                    content.style.setProperty('width', '95vw', 'important');
                    content.style.setProperty('max-height', '90vh', 'important');
                } else {
                    content.style.setProperty('width', '90%', 'important');
                    content.style.setProperty('max-width', '600px', 'important');
                    content.style.setProperty('max-height', '90vh', 'important');
                }
            }
            
            // 设置标题
            if (titleEl) {
                titleEl.textContent = item ? '✏️ 編輯角色提示詞' : '➕ 添加角色提示詞';
            }
            
            // 填充数据（如果是编辑模式）
            if (item) {
                if (keynameInput) keynameInput.value = item.keyname || '';
                if (promptInput) promptInput.value = item.prompt || '';
                if (aliasesInput) aliasesInput.value = item.aliases || '';
                modal.dataset.editItemId = item.id;
            } else {
                // 清空输入框（添加模式）
                if (keynameInput) keynameInput.value = '';
                if (promptInput) promptInput.value = '';
                if (aliasesInput) aliasesInput.value = '';
                delete modal.dataset.editItemId;
            }
            
            // 显示窗口
            modal.style.display = 'flex';
            
            // 聚焦到第一个输入框
            setTimeout(() => {
                if (keynameInput) keynameInput.focus();
            }, 100);
        },
        
        /**
         * 🔥 新增：隐藏添加/编辑角色提示词的弹出窗口
         */
        hideCharacterPromptEditModal() {
            const modal = document.getElementById('character-prompt-edit-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        },
        
        /**
         * 🔥 新增：从弹出窗口保存角色提示词
         */
        async saveFromEditModal() {
            const modal = document.getElementById('character-prompt-edit-modal');
            const keynameInput = document.getElementById('edit-modal-keyname');
            const promptInput = document.getElementById('edit-modal-prompt');
            const aliasesInput = document.getElementById('edit-modal-aliases');
            
            if (!modal || !keynameInput || !promptInput) return;
            
            const keyname = keynameInput.value.trim();
            const prompt = promptInput.value.trim();
            const aliases = aliasesInput ? aliasesInput.value.trim() : '';
            
            if (!keyname || !prompt) {
                alert('請填寫 Keyname 和角色形象提示詞');
                return;
            }
            
            try {
                const itemId = modal.dataset.editItemId || Date.now().toString();
                
                // 保存到数据库
                await this.saveCharacterPromptToDB({
                    id: itemId,
                    keyname: keyname,
                    prompt: prompt,
                    aliases: aliases || ''
                });
                
                // 如果是编辑模式，更新列表中的条目
                if (modal.dataset.editItemId) {
                    // 重新加载列表以更新显示
                    await this.loadCharacterPromptList();
                    
                    // 滚动到该条目并高亮
                    setTimeout(() => {
                        const itemDiv = document.getElementById(`character-prompt-item-${itemId}`);
                        if (itemDiv) {
                            itemDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            itemDiv.style.transition = 'all 0.3s ease';
                            itemDiv.style.background = '#2d5a3d';
                            itemDiv.style.border = '2px solid #28a745';
                            itemDiv.style.boxShadow = '0 0 20px rgba(40, 167, 69, 0.5)';
                            setTimeout(() => {
                                itemDiv.style.background = '#2d2d2d';
                                itemDiv.style.border = '1px solid #444444';
                                itemDiv.style.boxShadow = 'none';
                            }, 2000);
                        }
                    }, 100);
                } else {
                    // 如果是添加模式，添加到列表
                    const newItem = {
                        id: itemId,
                        keyname: keyname,
                        prompt: prompt,
                        aliases: aliases || ''
                    };
                    this.addCharacterPromptItem(newItem);
                    
                    // 滚动到新条目并高亮
                    setTimeout(() => {
                        const itemDiv = document.getElementById(`character-prompt-item-${itemId}`);
                        if (itemDiv) {
                            itemDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            itemDiv.style.transition = 'all 0.3s ease';
                            itemDiv.style.background = '#3d5a80';
                            itemDiv.style.border = '2px solid #64b5f6';
                            itemDiv.style.boxShadow = '0 0 20px rgba(100, 181, 246, 0.5)';
                            setTimeout(() => {
                                itemDiv.style.background = '#2d2d2d';
                                itemDiv.style.border = '1px solid #444444';
                                itemDiv.style.boxShadow = 'none';
                            }, 3000);
                        }
                    }, 100);
                }
                
                // 关闭窗口
                this.hideCharacterPromptEditModal();
                
                logger.info(`角色提示詞已保存: ${keyname}`);
            } catch (error) {
                logger.error('保存角色提示詞失敗:', error);
                alert('保存失敗: ' + error.message);
            }
        },
        
        /**
         * 🔥 新增：加载角色提示词列表
         */
        async loadCharacterPromptList() {
            const container = document.getElementById('character-prompt-list-container');
            if (!container) return;
            
            container.innerHTML = '';
            
            try {
                const items = await this.loadCharacterPromptsFromDB();
                
                if (items.length === 0) {
                    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #6c757d;">暫無角色提示詞配置，點擊「添加角色提示詞」按鈕開始添加</div>';
                } else {
                    items.forEach(item => {
                        this.addCharacterPromptItem(item);
                    });
                }
            } catch (error) {
                logger.error('載入角色提示詞列表失敗:', error);
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">載入失敗: ' + error.message + '</div>';
            }
        },
        
        /**
         * 🔥 新增：初始化角色提示词 IndexedDB
         */
        async initCharacterPromptDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('CharacterPromptDB', 1);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('characterPrompts')) {
                        const store = db.createObjectStore('characterPrompts', { keyPath: 'id' });
                        store.createIndex('keyname', 'keyname', { unique: false });
                    }
                };
            });
        },
        
        /**
         * 🔥 新增：保存角色提示词到 IndexedDB
         */
        async saveCharacterPromptToDB(item) {
            const db = await this.initCharacterPromptDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['characterPrompts'], 'readwrite');
                const store = transaction.objectStore('characterPrompts');
                const request = store.put(item);
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },
        
        /**
         * 🔥 新增：从 IndexedDB 加载所有角色提示词
         */
        async loadCharacterPromptsFromDB() {
            const db = await this.initCharacterPromptDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['characterPrompts'], 'readonly');
                const store = transaction.objectStore('characterPrompts');
                const request = store.getAll();
                
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },
        
        /**
         * 🔥 新增：从 IndexedDB 删除角色提示词
         */
        async deleteCharacterPromptFromDB(itemId) {
            const db = await this.initCharacterPromptDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['characterPrompts'], 'readwrite');
                const store = transaction.objectStore('characterPrompts');
                const request = store.delete(itemId);
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },
        
        /**
         * 🔥 新增：根据角色名查找角色提示词
         */
        async findCharacterPrompt(characterName) {
            try {
                const items = await this.loadCharacterPromptsFromDB();
                
                // 精确匹配 keyname
                let item = items.find(i => i.keyname === characterName);
                
                // 如果没有找到，尝试匹配别名
                if (!item) {
                    item = items.find(i => {
                        if (!i.aliases) return false;
                        const aliasList = i.aliases.split(',').map(a => a.trim());
                        return aliasList.includes(characterName);
                    });
                }
                
                return item || null;
            } catch (error) {
                logger.error('查找角色提示詞失敗:', error);
                return null;
            }
        }
    };

    // 暴露到全局
    window.ImageSettingsPanel = ImageSettingsPanel;

    logger.info('图片设置面板已载入');

})();

