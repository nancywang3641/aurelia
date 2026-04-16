// ----------------------------------------------------------------
// [檔案] os_settings.js (V6.0.0 - Aurelia Style, Sync Primary URL & Factory Reset)
// 職責：管理 PhoneOS 全域設定
// 修改：
// 1. 全面套用 Aurelia 核心 CSS (拿鐵色/流金/磨砂玻璃)，統一系統視覺。
// 2. 副模型新增「同步主模型 API 端點」拉桿，自動繼承 URL/Key。
// 3. 🔥 新增：核彈級「一鍵格式化」雙重確認清空數據功能。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入系統設置模塊 (V6.0.0 Aurelia Style & Sync & Reset)...');

    // 定義系統級樣式 (全面替換為 Aurelia 咖啡流金風格)
    const appStyle = `
        /* 基礎容器 */
        .set-container { width: 100%; height: 100%; background: #1a0d0a; color: #FFF8E7; display: flex; flex-direction: column; overflow: hidden; font-family: 'Noto Sans TC', sans-serif; }
        .set-header { padding: 15px 20px; background: rgba(69, 34, 22, 0.85); border-bottom: 1px solid rgba(251,223,162,0.3); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; color: #FBDFA2; }
        
        /* 🔥 iOS 安全區域自動適應與手動強制下移 */
        .set-header { padding-top: calc(15px + env(safe-area-inset-top, 0px)); }
        body.layout-pad-ios .set-header { padding-top: 55px !important; }

        .set-title { font-size: 18px; font-weight: 800; letter-spacing: 2px; }
        .set-back-btn { font-size: 24px; color: #B78456; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s; }
        .set-back-btn:hover { background: rgba(251,223,162,0.15); color: #FBDFA2; }
        
        /* Tab 導航 */
        .set-tabs { display: flex; background: rgba(69, 34, 22, 0.9); padding: 0 10px; border-bottom: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
        .set-tabs::-webkit-scrollbar { display: none; }
        .set-tab { flex: 1; min-width: 70px; text-align: center; padding: 12px 0; font-size: 13px; color: #B78456; cursor: pointer; position: relative; transition: 0.3s; font-weight: 600; letter-spacing: 0.5px; }
        .set-tab.active { color: #FBDFA2; font-weight: 800; }
        .set-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #FBDFA2; border-radius: 3px 3px 0 0; box-shadow: 0 -2px 8px rgba(251,223,162,0.5); }
        
        /* 內容區 */
        .set-content { flex: 1; overflow-y: auto; padding: 20px; position: relative; }
        .set-content::-webkit-scrollbar { width: 4px; }
        .set-content::-webkit-scrollbar-thumb { background: rgba(251,223,162,0.3); border-radius: 2px; }
        .tab-view { display: none; animation: fadeIn 0.3s cubic-bezier(0.2,0.8,0.2,1); }
        .tab-view.active { display: block; }
        
        /* 組件 */
        .set-group { background: rgba(120, 55, 25, 0.85); border-radius: 8px; padding: 20px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 15px; border: 1px solid rgba(251,223,162,0.3); box-shadow: 0 6px 20px rgba(0,0,0,0.3); backdrop-filter: blur(10px); }
        .set-label { font-size: 13px; color: #FBDFA2; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; letter-spacing: 1px; }
        .set-desc { font-size: 11px; color: #E0D8C8; line-height: 1.6; margin-bottom: 5px; }
        .set-input, .set-select, .set-textarea { background: rgba(69, 34, 22, 0.8); border: 1px solid rgba(251,223,162,0.4); color: #FFF8E7; padding: 12px; border-radius: 4px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; transition: all 0.2s; }
        .set-input:focus, .set-textarea:focus, .set-select:focus { border-color: #FBDFA2; background: #452216; box-shadow: 0 0 0 2px rgba(251,223,162,0.2); }
        .set-textarea { resize: vertical; min-height: 80px; font-family: monospace; line-height: 1.5; }
        
        /* 滑桿 */
        .set-slider-container { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
        .set-slider { -webkit-appearance: none; width: 100%; height: 4px; background: rgba(69, 34, 22, 0.9); border: 1px solid rgba(251,223,162,0.2); border-radius: 2px; outline: none; }
        .set-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; background: #FBDFA2; border-radius: 50%; cursor: pointer; transition: 0.2s; box-shadow: 0 0 8px rgba(251,223,162,0.5); }
        .set-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
        .set-slider-val { font-family: 'Courier New', monospace; color: #FBDFA2; font-weight: 800; }

        /* 按鈕與開關 */
        .model-row { display: flex; gap: 10px; align-items: center; }
        .btn-fetch { background: rgba(120, 55, 25, 0.6); color: #FBDFA2; border: 1px solid rgba(251,223,162,0.4); width: 44px; height: 42px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; flex-shrink: 0; transition: all 0.2s; }
        .btn-fetch:hover { background: rgba(251,223,162,0.15); border-color: #FBDFA2; }
        .btn-save { padding: 14px; border-radius: 4px; text-align: center; font-weight: 900; cursor: pointer; margin-top: 10px; background: linear-gradient(135deg, #FBDFA2, #B78456); color: #452216; user-select: none; box-shadow: 0 4px 15px rgba(251,223,162,0.3); transition: all 0.2s; letter-spacing: 2px; }
        .btn-save:hover { filter: brightness(1.1); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(251,223,162,0.4); }
        .btn-test { padding: 12px; border-radius: 4px; text-align: center; font-weight: 800; cursor: pointer; margin-top: 10px; background: rgba(251,223,162,0.1); color: #FBDFA2; border: 1px solid rgba(251,223,162,0.4); transition: all 0.2s; }
        .btn-test:hover { background: rgba(251,223,162,0.2); border-color: #FBDFA2; }
        
        /* 🔥 新增：危險區域與格式化按鈕 */
        .danger-zone { margin-top: 30px; border: 1px solid rgba(252, 129, 129, 0.3); background: rgba(252, 129, 129, 0.05); padding: 15px; border-radius: 12px; }
        .danger-zone h3 { color: #fc8181; font-size: 15px; margin-bottom: 8px; font-weight: bold; }
        .danger-zone p { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 12px; line-height: 1.4; }
        .btn-danger { padding: 12px; border-radius: 4px; text-align: center; font-weight: 800; cursor: pointer; background: rgba(252, 129, 129, 0.2); color: #fc8181; border: 1px solid rgba(252, 129, 129, 0.5); transition: all 0.2s; }
        .btn-danger:hover { background: rgba(252, 129, 129, 0.3); box-shadow: 0 0 10px rgba(252, 129, 129, 0.3); }

        .toggle-switch { position: relative; width: 42px; height: 22px; flex-shrink: 0; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(69, 34, 22, 0.6); border: 1px solid rgba(251,223,162,0.3); transition: .3s; border-radius: 22px; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: #B78456; transition: .3s; border-radius: 50%; }
        input:checked + .slider { background-color: rgba(251,223,162,0.2); border-color: #FBDFA2; }
        input:checked + .slider:before { transform: translateX(20px); background-color: #FBDFA2; box-shadow: 0 0 8px rgba(251,223,162,0.6); }
        .set-status { font-size: 11px; font-weight: bold; color: #B78456; text-align: center; margin-top: 20px; min-height: 20px; padding-bottom: 20px; letter-spacing: 1px; }
        .hidden { display: none !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;

    const targetDoc = (window.parent && window.parent.document) ? window.parent.document : document;
    if (!targetDoc.getElementById('os-settings-css')) {
        const s = targetDoc.createElement('style'); s.id = 'os-settings-css'; s.innerHTML = appStyle; targetDoc.head.appendChild(s);
    } else {
        targetDoc.getElementById('os-settings-css').innerHTML = appStyle;
    }

    const LLM_STORAGE_KEY = 'os_global_config';
    const SEC_LLM_STORAGE_KEY = 'os_secondary_llm_config';
    const IMG_STORAGE_KEY = 'os_image_config';
    const MINIMAX_STORAGE_KEY = 'os_minimax_config';
    
    // --- 讀取 LLM 設置 ---
    function loadLlmConfig() {
        let saved = localStorage.getItem(LLM_STORAGE_KEY);
        let config = { 
            url: '', key: '', model: 'gemini-3.1-pro-preview', 
            useSystemApi: true, stProfileId: '', 
            directMode: false, enableStreaming: false, disableTyping: false,
            enableSummaryOnly: false,
            maxTokens: 2000, temperature: 1.0, top_p: 1.0, frequency_penalty: 0, presence_penalty: 0,
            usePresetPrompts: false, presetName: ''
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    // --- 讀取副模型 LLM 設置 (含 syncWithPrimary) ---
    function loadSecLlmConfig() {
        let saved = localStorage.getItem(SEC_LLM_STORAGE_KEY);
        let config = {
            url: '', key: '', model: 'gemini-1.5-flash',
            useSystemApi: true, stProfileId: '', syncWithPrimary: true, // 🔥 預設開啟同步主模型
            directMode: false, enableStreaming: false, disableTyping: false,
            enableSummaryOnly: false,
            maxTokens: 1000, temperature: 1.0, top_p: 1.0, frequency_penalty: 0, presence_penalty: 0,
            usePresetPrompts: false, presetName: ''
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    // --- 讀取 Image 設置 ---
    function loadImageConfig() {
        let saved = localStorage.getItem(IMG_STORAGE_KEY);
        let config = {
            service: 'pollinations',
            pollinations: {
                url: 'https://gen.pollinations.ai/image',
                apiKey: '',
                model: 'zimage',
                size: '512x512',
                models: {
                    'flux': 'Flux Schnell (0.001p)',
                    'zimage': 'Z-Image Turbo (0.002p)',
                    'flux-2-dev': 'FLUX.2 Dev [Alpha] (0.001p)',
                    'imagen-4': 'Imagen 4 [Alpha] (0.0025p)',
                    'grok-imagine': 'Grok Imagine [Alpha] (0.0025p)',
                    'klein': 'FLUX.2 Klein 4B (0.01p)',
                    'gptimage': 'GPT Image 1 Mini (高消耗)',
                    'klein-large': 'FLUX.2 Klein 9B (0.015p)'
                },
                charBasePrompt: 'anime style, 2d, cel shading, flat color, illustration, high quality, best quality, no photorealistic, no 3d, clean lines',
                charNegPrompt: 'bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text',
                petBasePrompt: 'cute, 2D art, sticker style, simple background, white background, high quality',
                petNegPrompt: 'bad anatomy, blurry, low quality, worst quality, human, person, watermark, text'
            },
            novelai: {
                token: '',
                url: 'https://image.novelai.net/ai/generate-image',
                model: 'nai-diffusion-3',
                sampler: 'k_euler_ancestral',
                scale: 5,
                steps: 28,
                ucPreset: 1,
                qualityToggle: true,
                smea: true,
                smeaDyn: false,
                charBasePrompt: '',
                charNegPrompt: '',
                itemBasePrompt: '',
                itemNegPrompt: '',
                naiPresets: []
            }
        };
        if (saved) {
            try {
                const savedConfig = JSON.parse(saved);
                const pol = savedConfig.pollinations || {};
                if (pol.defaultPrompt && !pol.charBasePrompt) {
                    pol.charBasePrompt = pol.defaultPrompt;
                    delete pol.defaultPrompt;
                }
                config = {
                    ...config,
                    ...savedConfig,
                    pollinations: {
                        ...config.pollinations,
                        ...pol,
                        models: config.pollinations.models
                    }
                };
            } catch(e) {}
        }
        return config;
    }
    
    // --- 讀取 Minimax 語音設置 ---
    function loadMinimaxConfig() {
        let saved = localStorage.getItem(MINIMAX_STORAGE_KEY);
        let config = {
            enabled: false,
            groupId: '',
            apiKey: '',
            provider: 'cn',
            speechModel: 'speech-01-turbo',
            defaultSpeed: 1.0,
            defaultLanguageBoost: '',
            voiceProfiles: []
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    function saveConfig(llmData, secLlmData, imgData, minimaxData) {
        localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(llmData));
        localStorage.setItem(SEC_LLM_STORAGE_KEY, JSON.stringify(secLlmData));
        localStorage.setItem(IMG_STORAGE_KEY, JSON.stringify(imgData));
        
        if (minimaxData) {
            localStorage.setItem(MINIMAX_STORAGE_KEY, JSON.stringify(minimaxData));
            const win2 = window.parent || window;
            if (win2.OS_MINIMAX && typeof win2.OS_MINIMAX.saveConfig === 'function') {
                win2.OS_MINIMAX.saveConfig(minimaxData);
            }
        }
        
        const win = window.parent || window;
        if (win.OS_IMAGE_MANAGER) {
            win.OS_IMAGE_MANAGER.config.service = imgData.service;
            if (imgData.pollinations) {
                win.OS_IMAGE_MANAGER.config.pollinations = {
                    ...win.OS_IMAGE_MANAGER.config.pollinations,
                    ...imgData.pollinations,
                    models: win.OS_IMAGE_MANAGER.config.pollinations.models
                };
            }
            if (imgData.novelai) {
                win.OS_IMAGE_MANAGER.config.novelai = {
                    ...win.OS_IMAGE_MANAGER.config.novelai,
                    ...imgData.novelai
                };
            }
            console.log('[OS設置] ✅ 圖片管理器配置已更新, service:', imgData.service);
        }
    }

    window.OS_SETTINGS = {
        getConfig: loadLlmConfig,
        getSecondaryConfig: loadSecLlmConfig,
        getImageConfig: loadImageConfig,
        getMinimaxConfig: loadMinimaxConfig,
        saveConfig: saveConfig
    };

    const getSTContext = () => { try { return window.parent.SillyTavern ? window.parent.SillyTavern.getContext() : null; } catch (e) { return null; } };

    function launchApp(container) {
        const llmConfig = loadLlmConfig();
        const secLlmConfig = loadSecLlmConfig();
        const imgConfig = loadImageConfig();
        const minimaxConfig = loadMinimaxConfig();

        const isStandalone = !!(window.OS_API && typeof window.OS_API.isStandalone === 'function' && window.OS_API.isStandalone());
        if (isStandalone) {
            llmConfig.useSystemApi = false;
            secLlmConfig.useSystemApi = false;
        }
        const stHide = isStandalone ? ' style="display:none"' : '';
        
        let stProfiles = [];
        let stActiveProfileId = '';
        try {
            const context = getSTContext();
            if (context && context.extensionSettings && context.extensionSettings.connectionManager) {
                stProfiles = context.extensionSettings.connectionManager.profiles || [];
                stActiveProfileId = context.extensionSettings.connectionManager.selectedProfile || '';
            }
        } catch(e) {}

        const buildProfileOptions = (currentId) => {
            const resolvedId = currentId || stActiveProfileId;
            let opts = `<option value=""${!resolvedId ? ' selected' : ''}>(🚀 當前激活的連接 / Current Active)</option>`;
            stProfiles.forEach(p => {
                const isSelected = p.id === resolvedId ? 'selected' : '';
                const safeName = p.name ? p.name.replace(/</g, "&lt;") : "Unknown";
                opts += `<option value="${p.id}" ${isSelected}>📂 ${safeName.substring(0,25)}</option>`;
            });
            return opts;
        };

        const primaryProfileOpts = buildProfileOptions(llmConfig.stProfileId);
        const secondaryProfileOpts = buildProfileOptions(secLlmConfig.stProfileId);

        // HTML 結構
        container.innerHTML = `
            <div class="set-container">
                <div class="set-header">
                    <div class="set-back-btn" id="nav-home">‹</div>
                    <div class="set-title">系統設置</div>
                    <div style="width:32px"></div>
                </div>
                
                <div class="set-tabs">
                    <div class="set-tab active" data-tab="llm">🧠 主模型</div>
                    <div class="set-tab" data-tab="sec-llm">⚡ 副模型</div>
                    <div class="set-tab" data-tab="img">🎨 圖片設置</div>
                    <div class="set-tab" data-tab="voice">🎵 語音</div>
                    <div class="set-tab" data-tab="sys">⚙️ 系統/備份</div>
                </div>

                <div class="set-content">
                    
                    <div id="view-llm" class="tab-view active">
                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>🔗 跟隨酒館主系統 (推薦)</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-system-api" ${llmConfig.useSystemApi ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="st-profile-group" class="${llmConfig.useSystemApi ? '' : 'hidden'}" style="margin-top:10px; border-top:1px solid rgba(251,223,162,0.2); padding-top:10px;">
                                <div class="set-label">選擇連接預設 (Profile)</div>
                                <select class="set-select" id="os-st-profile">${primaryProfileOpts}</select>
                                <div id="st-profile-info" style="margin-top:6px; font-size:11px; color:#B78456; word-break:break-all; line-height:1.6;"></div>
                            </div>
                        </div>

                        <div class="set-group" id="manual-api-group">
                            <div><div class="set-label">手動 API 地址</div><input class="set-input" id="os-api-url" placeholder="http://..." value="${llmConfig.url}"></div>
                            <div style="margin-top:10px;"><div class="set-label">API Key</div><input class="set-input" id="os-api-key" type="password" value="${llmConfig.key}"></div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">選擇模型</div>
                            <div id="model-system-notice" class="${llmConfig.useSystemApi ? '' : 'hidden'}" style="background:rgba(251,223,162,0.1); padding:10px; border-radius:4px; font-size:12px; color:#FBDFA2; border:1px solid rgba(251,223,162,0.3);">
                                🔗 已跟隨酒館主系統，模型由酒館決定。<br>直接在酒館介面切換模型即可，無需在此設定。
                            </div>
                            <div class="model-row ${llmConfig.useSystemApi ? 'hidden' : ''}" id="model-row">
                                <select class="set-select" id="os-api-model"><option value="${llmConfig.model}">${llmConfig.model} (當前)</option></select>
                                <div class="btn-fetch" id="os-fetch-btn" title="${isStandalone ? '拉取模型清單' : '從酒館同步'}">${isStandalone ? '<i class="fa-solid fa-microchip"></i>' : '🔄'}</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span>僅讀取摘要 (Save Tokens)</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-summary-mode" ${llmConfig.enableSummaryOnly ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">開啟後，手機系統只讀取 &lt;summary&gt; 標籤內容，節省大量 Token 並避免讀取過舊的歷史。</div>
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>📋 注入 Preset 自訂條目</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-use-preset-prompts" ${llmConfig.usePresetPrompts ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">開啟後，注入指定 Preset 的自訂條目為系統提示詞（排除佔位符）。需安裝 TavernHelper 插件。</div>
                            <div id="os-preset-name-group" style="margin-top:10px; display:${llmConfig.usePresetPrompts ? 'flex' : 'none'}; gap:8px; align-items:center;">
                                <select class="set-select" id="os-preset-name" style="flex:1;">
                                    <option value="">（使用當前 in_use Preset）</option>
                                </select>
                                <div class="btn-fetch" id="os-preset-refresh-btn" title="重新整理 Preset 列表" style="flex-shrink:0;">🔄</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>Max Tokens</span></div>
                                <input type="number" min="100" max="200000" step="100" value="${llmConfig.maxTokens}" class="set-input" id="os-max-tokens" style="margin-top:6px; width:100%;">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Temperature</span><span class="set-slider-val" id="val-temp">${llmConfig.temperature}</span></div>
                                <input type="range" min="0" max="2" step="0.05" value="${llmConfig.temperature}" class="set-slider" id="os-temperature">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Top P</span><span class="set-slider-val" id="val-topp">${llmConfig.top_p ?? 1.0}</span></div>
                                <input type="range" min="0" max="1" step="0.01" value="${llmConfig.top_p ?? 1.0}" class="set-slider" id="os-top-p">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Frequency Penalty</span><span class="set-slider-val" id="val-freq">${llmConfig.frequency_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${llmConfig.frequency_penalty ?? 0}" class="set-slider" id="os-freq-penalty">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Presence Penalty</span><span class="set-slider-val" id="val-pres">${llmConfig.presence_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${llmConfig.presence_penalty ?? 0}" class="set-slider" id="os-pres-penalty">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span>💭 請求模型思維鏈</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-enable-thinking" ${llmConfig.enableThinking ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div style="font-size:11px; color:#B78456; margin-top:6px;">讓模型回傳思考過程（需模型支援，如 Gemini 2.5 / Claude 3.5+）。開啟後 Temperature 自動設為 1。</div>
                            <div style="margin-top:10px;" id="thinking-budget-group" class="${llmConfig.enableThinking ? '' : 'hidden'}">
                                <div class="set-label"><span>思考預算 (tokens)</span><span class="set-slider-val" id="val-think-budget">${llmConfig.thinkingBudget || 8000}</span></div>
                                <input type="range" min="1000" max="32000" step="1000" value="${llmConfig.thinkingBudget || 8000}" class="set-slider" id="os-thinking-budget">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔌 測試 API 連線</div>
                            <div class="btn-test" id="os-test-btn">發送測試訊息</div>
                            <div id="os-test-result" style="display:none; margin-top:10px; background:rgba(69,34,22,0.8); border-radius:4px; padding:12px; font-size:12px; color:#E0D8C8; font-family:monospace; white-space:pre-wrap; word-break:break-all; max-height:120px; overflow-y:auto;"></div>
                        </div>
                    </div>

                    <div id="view-sec-llm" class="tab-view hidden">
                        <div style="background:rgba(251,223,162,0.1); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid rgba(251,223,162,0.3); font-size:12px; color:#FBDFA2; line-height:1.6;">
                            ℹ️ <b>副模型</b> 用於寵物聊天、路人NPC對話等輕量任務。建議使用 Gemini Flash 或 GPT-4o-mini 等快速模型。
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>🔗 跟隨酒館主系統</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-system-api" ${secLlmConfig.useSystemApi ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="sec-st-profile-group" class="${secLlmConfig.useSystemApi ? '' : 'hidden'}" style="margin-top:10px; border-top:1px solid rgba(251,223,162,0.2); padding-top:10px;">
                                <div class="set-label">選擇連接預設 (Profile)</div>
                                <select class="set-select" id="sec-st-profile">${secondaryProfileOpts}</select>
                                <div id="sec-st-profile-info" style="margin-top:6px; font-size:11px; color:#B78456; word-break:break-all; line-height:1.6;"></div>
                            </div>
                        </div>

                        <div class="set-group" id="sec-sync-primary-group" style="${secLlmConfig.useSystemApi ? 'display:none;' : ''}">
                             <div class="set-label">
                                <span>🔗 同步主模型 URL 與 Key</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-sync-primary" ${secLlmConfig.syncWithPrimary ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">開啟後，自動共用主模型的 API 地址與密鑰，模型選項仍可獨立選擇。</div>
                        </div>

                        <div class="set-group" id="sec-manual-api-group" style="${(secLlmConfig.useSystemApi || secLlmConfig.syncWithPrimary) ? 'display:none;' : 'display:flex;'}">
                            <div><div class="set-label">手動 API 地址</div><input class="set-input" id="sec-api-url" placeholder="http://..." value="${secLlmConfig.url}"></div>
                            <div style="margin-top:10px;"><div class="set-label">API Key</div><input class="set-input" id="sec-api-key" type="password" value="${secLlmConfig.key}"></div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">選擇模型</div>
                            <div id="sec-model-system-notice" class="${secLlmConfig.useSystemApi ? '' : 'hidden'}" style="background:rgba(251,223,162,0.1); padding:10px; border-radius:4px; font-size:12px; color:#FBDFA2; border:1px solid rgba(251,223,162,0.3);">
                                🔗 已跟隨酒館主系統，模型由酒館決定。<br>直接在酒館介面切換模型即可，無需在此設定。
                            </div>
                            <div class="model-row ${secLlmConfig.useSystemApi ? 'hidden' : ''}" id="sec-model-row">
                                <select class="set-select" id="sec-api-model"><option value="${secLlmConfig.model}">${secLlmConfig.model} (當前)</option></select>
                                <div class="btn-fetch" id="sec-fetch-btn" title="${isStandalone ? '拉取模型清單' : '從端點同步'}">${isStandalone ? '<i class="fa-solid fa-microchip"></i>' : '🔄'}</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span>僅讀取摘要 (Save Tokens)</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-summary-mode" ${secLlmConfig.enableSummaryOnly ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>📋 注入 Preset 自訂條目</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-use-preset-prompts" ${secLlmConfig.usePresetPrompts ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="sec-preset-name-group" style="margin-top:10px; display:${secLlmConfig.usePresetPrompts ? 'flex' : 'none'}; gap:8px; align-items:center;">
                                <select class="set-select" id="sec-preset-name" style="flex:1;">
                                    <option value="">（使用當前 in_use Preset）</option>
                                </select>
                                <div class="btn-fetch" id="sec-preset-refresh-btn" title="重新整理 Preset 列表" style="flex-shrink:0;">🔄</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>Max Tokens</span></div>
                                <input type="number" min="100" max="200000" step="100" value="${secLlmConfig.maxTokens}" class="set-input" id="sec-max-tokens" style="margin-top:6px; width:100%;">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Temperature</span><span class="set-slider-val" id="sec-val-temp">${secLlmConfig.temperature}</span></div>
                                <input type="range" min="0" max="2" step="0.05" value="${secLlmConfig.temperature}" class="set-slider" id="sec-temperature">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Top P</span><span class="set-slider-val" id="sec-val-topp">${secLlmConfig.top_p ?? 1.0}</span></div>
                                <input type="range" min="0" max="1" step="0.01" value="${secLlmConfig.top_p ?? 1.0}" class="set-slider" id="sec-top-p">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Frequency Penalty</span><span class="set-slider-val" id="sec-val-freq">${secLlmConfig.frequency_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${secLlmConfig.frequency_penalty ?? 0}" class="set-slider" id="sec-freq-penalty">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Presence Penalty</span><span class="set-slider-val" id="sec-val-pres">${secLlmConfig.presence_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${secLlmConfig.presence_penalty ?? 0}" class="set-slider" id="sec-pres-penalty">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔌 測試 API 連線</div>
                            <div class="btn-test" id="sec-test-btn">發送測試訊息</div>
                            <div id="sec-test-result" style="display:none; margin-top:10px; background:rgba(69,34,22,0.8); border-radius:4px; padding:12px; font-size:12px; color:#E0D8C8; font-family:monospace; white-space:pre-wrap; word-break:break-all; max-height:120px; overflow-y:auto;"></div>
                        </div>
                    </div>

                    <div id="view-img" class="tab-view hidden">
                        <div class="set-group">
                            <div class="set-label">生成服務</div>
                            <select class="set-select" id="img-service">
                                <option value="pollinations" ${imgConfig.service === 'pollinations' ? 'selected' : ''}>✨ Pollinations (Pollen 積分制)</option>
                                <option value="novelai" ${imgConfig.service === 'novelai' ? 'selected' : ''}>💎 NovelAI (訂閱制)</option>
                            </select>

                            <div id="img-group-pollinations" class="${imgConfig.service === 'pollinations' ? '' : 'hidden'}">
                                <div style="margin-top:15px;">
                                    <div class="set-label">API Key <span style="font-size:11px; color:#fc8181;">(必填 - 需儲值)</span></div>
                                    <input class="set-input" id="img-pol-apikey" type="password" placeholder="請輸入 Pollinations API Key..." value="${imgConfig.pollinations.apiKey || ''}">
                                    <div class="set-desc" style="color:#FBDFA2; margin-top:4px;">* 現在已無免費方案，請至官網獲取 Key。</div>
                                </div>
                                <div style="margin-top:15px;">
                                    <div class="set-label">模型 (按價格排序)</div>
                                    <select class="set-select" id="img-pol-model">
                                        <option value="flux" ${imgConfig.pollinations.model === 'flux' ? 'selected' : ''}>🟢 Flux Schnell (0.001p)</option>
                                        <option value="zimage" ${imgConfig.pollinations.model === 'zimage' ? 'selected' : ''}>🟢 Z-Image Turbo (0.002p)</option>
                                        <option value="flux-2-dev" ${imgConfig.pollinations.model === 'flux-2-dev' ? 'selected' : ''}>🔵 FLUX.2 Dev Alpha (0.001p)</option>
                                        <option value="imagen-4" ${imgConfig.pollinations.model === 'imagen-4' ? 'selected' : ''}>🔵 Imagen 4 Alpha (0.0025p)</option>
                                        <option value="grok-imagine" ${imgConfig.pollinations.model === 'grok-imagine' ? 'selected' : ''}>🔵 Grok Imagine Alpha (0.0025p)</option>
                                        <option value="klein" ${imgConfig.pollinations.model === 'klein' ? 'selected' : ''}>🟠 FLUX.2 Klein 4B (0.01p)</option>
                                        <option value="gptimage" ${imgConfig.pollinations.model === 'gptimage' ? 'selected' : ''}>🔴 GPT Image 1 Mini (高消耗)</option>
                                        <option value="klein-large" ${imgConfig.pollinations.model === 'klein-large' ? 'selected' : ''}>🟠 FLUX.2 Klein 9B (0.015p)</option>
                                    </select>
                                </div>
                                <div style="margin-top:15px;">
                                    <div class="set-label">圖片尺寸</div>
                                    <select class="set-select" id="img-pol-size">
                                        <option value="512x512" ${imgConfig.pollinations.size === '512x512' ? 'selected' : ''}>512x512 (方形)</option>
                                        <option value="768x1024" ${imgConfig.pollinations.size === '768x1024' ? 'selected' : ''}>768x1024 (手機桌布)</option>
                                        <option value="1024x1024" ${imgConfig.pollinations.size === '1024x1024' ? 'selected' : ''}>1024x1024 (高畫質)</option>
                                    </select>
                                </div>
                            </div>

                            <div id="img-group-nai" class="${imgConfig.service === 'novelai' ? '' : 'hidden'}">
                                <div style="margin-top:15px;">
                                    <div class="set-label">NovelAI Token <span style="font-size:11px; color:#fc8181;">(必填)</span></div>
                                    <input class="set-input" id="img-nai-token" type="password" placeholder="pst-..." value="${imgConfig.novelai.token}">
                                </div>
                                <div style="margin-top:15px;">
                                    <div class="set-label">模型版本</div>
                                    <select class="set-select" id="img-nai-model">
                                        <option value="nai-diffusion-3" ${imgConfig.novelai.model === 'nai-diffusion-3' ? 'selected' : ''}>V3 Anime（最省 Anlas）</option>
                                        <option value="nai-diffusion-4-curated-preview" ${imgConfig.novelai.model === 'nai-diffusion-4-curated-preview' ? 'selected' : ''}>V4 Curated（動漫精選）</option>
                                        <option value="nai-diffusion-4-full" ${imgConfig.novelai.model === 'nai-diffusion-4-full' ? 'selected' : ''}>V4 Full（開放風格）</option>
                                        <option value="nai-diffusion-4-5-full" ${imgConfig.novelai.model === 'nai-diffusion-4-5-full' ? 'selected' : ''}>V4.5 Full（最新/寫實佳）</option>
                                    </select>
                                </div>
                                <div style="margin-top:15px; border:1px solid rgba(251,223,162,0.3); border-radius:4px; overflow:hidden;">
                                    <div class="set-label" style="padding:10px 12px; color:#FBDFA2; cursor:pointer; user-select:none; display:flex; justify-content:space-between; align-items:center;"
                                        onclick="(function(btn){const body=btn.nextElementSibling;const arrow=btn.querySelector('.nai-adv-arrow');const open=body.style.display!=='none';body.style.display=open?'none':'block';arrow.textContent=open?'▶':'▼';})(this)">
                                        <span>⚙️ 進階參數 <span style="font-size:11px; color:#B78456; font-weight:normal;">（不懂可不動，預設跟官方一致）</span></span>
                                        <span class="nai-adv-arrow" style="font-size:11px; color:#B78456;">▶</span>
                                    </div>
                                    <div style="display:none; padding:12px; border-top:1px solid rgba(251,223,162,0.2); background:rgba(69,34,22,0.4);">
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                        <div>
                                            <div class="set-label" style="font-size:11px;">Sampler</div>
                                            <select class="set-select" id="img-nai-sampler">
                                                <option value="k_euler_ancestral" ${(imgConfig.novelai.sampler||'k_euler_ancestral')==='k_euler_ancestral'?'selected':''}>k_euler_ancestral（預設）</option>
                                                <option value="k_euler" ${imgConfig.novelai.sampler==='k_euler'?'selected':''}>k_euler</option>
                                                <option value="k_dpmpp_2m" ${imgConfig.novelai.sampler==='k_dpmpp_2m'?'selected':''}>k_dpmpp_2m（V4.5 推薦）</option>
                                                <option value="k_dpmpp_2s_ancestral" ${imgConfig.novelai.sampler==='k_dpmpp_2s_ancestral'?'selected':''}>k_dpmpp_2s_ancestral</option>
                                                <option value="k_dpmpp_sde" ${imgConfig.novelai.sampler==='k_dpmpp_sde'?'selected':''}>k_dpmpp_sde</option>
                                                <option value="k_dpmpp_2m_sde" ${imgConfig.novelai.sampler==='k_dpmpp_2m_sde'?'selected':''}>k_dpmpp_2m_sde（底板C）</option>
                                                <option value="ddim_v3" ${imgConfig.novelai.sampler==='ddim_v3'?'selected':''}>ddim_v3（V4 限定）</option>
                                            </select>
                                        </div>
                                        <div>
                                            <div class="set-label" style="font-size:11px;">CFG Scale <span style="font-size:10px; color:#B78456;">（建議 4~9）</span></div>
                                            <input class="set-input" type="number" id="img-nai-scale" min="1" max="20" step="0.5" value="${imgConfig.novelai.scale ?? 5}">
                                        </div>
                                        <div>
                                            <div class="set-label" style="font-size:11px;">Steps <span style="font-size:10px; color:#B78456;">（建議 28~40）</span></div>
                                            <input class="set-input" type="number" id="img-nai-steps" min="1" max="50" step="1" value="${imgConfig.novelai.steps ?? 28}">
                                        </div>
                                        <div>
                                            <div class="set-label" style="font-size:11px;">UC Preset <span style="font-size:10px; color:#B78456;">（負詞預設）</span></div>
                                            <select class="set-select" id="img-nai-uc-preset">
                                                <option value="0" ${(imgConfig.novelai.ucPreset??1)===0?'selected':''}>0 - 輕量</option>
                                                <option value="1" ${(imgConfig.novelai.ucPreset??1)===1?'selected':''}>1 - 標準（推薦）</option>
                                                <option value="2" ${(imgConfig.novelai.ucPreset??1)===2?'selected':''}>2 - 人形強化</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style="display:flex; gap:20px; margin-top:10px; flex-wrap:wrap;">
                                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                            <input type="checkbox" id="img-nai-quality-toggle" ${imgConfig.novelai.qualityToggle!==false?'checked':''}>
                                            <span class="set-label" style="margin:0; font-size:11px;">Quality Toggle</span>
                                        </label>
                                        <label id="img-nai-smea-group" style="display:flex; align-items:center; gap:6px; cursor:pointer; ${imgConfig.novelai.model==='nai-diffusion-3'?'':'opacity:0.35; pointer-events:none;'}">
                                            <input type="checkbox" id="img-nai-smea" ${imgConfig.novelai.smea!==false?'checked':''}>
                                            <span class="set-label" style="margin:0; font-size:11px;">SMEA <span style="font-size:10px; color:#B78456;">（V3 專屬）</span></span>
                                        </label>
                                        <label id="img-nai-smea-dyn-group" style="display:flex; align-items:center; gap:6px; cursor:pointer; ${imgConfig.novelai.model==='nai-diffusion-3'?'':'opacity:0.35; pointer-events:none;'}">
                                            <input type="checkbox" id="img-nai-smea-dyn" ${imgConfig.novelai.smeaDyn?'checked':''}>
                                            <span class="set-label" style="margin:0; font-size:11px;">SMEA Dynamic</span>
                                        </label>
                                    </div>
                                </div>
                                </div>

                                <div style="margin-top:15px; border:1px solid rgba(251,223,162,0.3); border-radius:4px; padding:12px; background:rgba(69,34,22,0.6);">
                                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                                        <div class="set-label" style="margin:0;">📋 提示詞預設</div>
                                        <span style="font-size:11px; color:#B78456;">含底詞、負詞、Sampler、Scale</span>
                                    </div>
                                    <div style="display:flex; gap:6px; align-items:center;">
                                        <select id="img-nai-preset-sel" class="set-select" style="flex:1; min-width:0;">
                                            <option value="">-- 選擇預設 --</option>
                                            ${(imgConfig.novelai.naiPresets || []).map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}
                                        </select>
                                        <span style="font-size:11px; color:#FBDFA2; cursor:pointer; white-space:nowrap; padding:5px 10px; border:1px solid #FBDFA2; border-radius:4px; background:rgba(251,223,162,0.1);" onclick="window._naiPreset.apply()">套用</span>
                                        <span style="font-size:11px; color:#FBDFA2; cursor:pointer; white-space:nowrap; padding:5px 10px; border:1px solid #FBDFA2; border-radius:4px; background:rgba(251,223,162,0.1);" onclick="window._naiPreset.save()">另存</span>
                                        <span style="font-size:11px; color:#fc8181; cursor:pointer; white-space:nowrap; padding:5px 10px; border:1px solid #fc8181; border-radius:4px; background:rgba(252,129,129,0.1);" onclick="window._naiPreset.del()">刪除</span>
                                    </div>
                                    <div id="img-nai-preset-name-row" style="display:none; margin-top:8px;">
                                        <div style="display:flex; gap:8px;">
                                            <input id="img-nai-preset-name-input" class="set-input" placeholder="輸入預設名稱（如：底板A - ge_tianzun）" style="flex:1;">
                                            <span style="font-size:11px; color:#FBDFA2; cursor:pointer; padding:5px 10px; border:1px solid #FBDFA2; border-radius:4px; white-space:nowrap; background:rgba(251,223,162,0.1);" onclick="window._naiPreset.confirmSave()">確認</span>
                                            <span style="font-size:11px; color:#B78456; cursor:pointer; padding:5px 10px; border:1px solid #B78456; border-radius:4px;" onclick="window._naiPreset.cancelSave()">取消</span>
                                        </div>
                                    </div>
                                </div>

                                <div style="margin-top:15px;">
                                    <div class="set-label">🎨 角色底詞 <span style="font-size:11px; color:#B78456; font-weight:normal;">（Danbooru tag 格式，逗號分隔）</span></div>
                                    <textarea class="set-textarea" id="img-nai-char-base">${imgConfig.novelai.charBasePrompt || ''}</textarea>
                                    <div style="text-align:right; margin-top:4px;">
                                        <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-nai-char-base').value='masterpiece, best quality, very aesthetic, absurdres, anime style, detailed face'">[重置]</span>
                                    </div>
                                </div>
                                <div style="margin-top:15px;">
                                    <div class="set-label">🚫 角色負詞</div>
                                    <textarea class="set-textarea" id="img-nai-char-neg">${imgConfig.novelai.charNegPrompt || ''}</textarea>
                                    <div style="text-align:right; margin-top:4px;">
                                        <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-nai-char-neg').value='nsfw, lowres, bad anatomy, bad hands, extra fingers, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark, blurry'">[重置]</span>
                                    </div>
                                </div>
                                <div style="margin-top:15px;">
                                    <div class="set-label">📦 物品/寵物底詞</div>
                                    <textarea class="set-textarea" id="img-nai-item-base">${imgConfig.novelai.itemBasePrompt || ''}</textarea>
                                    <div style="text-align:right; margin-top:4px;">
                                        <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-nai-item-base').value='masterpiece, best quality, white background, simple background, no background, product image, detailed'">[重置]</span>
                                    </div>
                                </div>
                                <div style="margin-top:15px;">
                                    <div class="set-label">🚫 物品/寵物負詞</div>
                                    <textarea class="set-textarea" id="img-nai-item-neg">${imgConfig.novelai.itemNegPrompt || ''}</textarea>
                                    <div style="text-align:right; margin-top:4px;">
                                        <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-nai-item-neg').value='person, human, character, body, face, hands, worst quality, low quality, blurry, watermark, text'">[重置]</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="img-pol-prompts-group" class="${imgConfig.service === 'novelai' ? 'hidden' : ''}">
                        <div class="set-group">
                            <div class="set-label">🎨 角色頭像通用底詞 <span style="font-size:10px; color:#B78456; font-weight:normal;">（全模組共用：夜店 / 偵探 / 寶寶 / VN頭像）</span></div>
                            <textarea class="set-textarea" id="img-style-prompt">${imgConfig.pollinations.charBasePrompt}</textarea>
                            <div style="font-size:11px; color:#B78456; margin-top:6px; line-height:1.5;">↑ 這裡設定的詞會自動加在所有角色頭像生圖的最前面。VN背景不受影響。VN頭像可在 VN 設定裡追加額外詞。</div>
                            <div style="text-align:right; margin-top:5px;">
                                <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-style-prompt').value='anime style, 2d, cel shading, flat color, illustration, high quality, best quality, no photorealistic, no 3d, clean lines'">[重置為預設]</span>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🚫 角色負詞</div>
                            <textarea class="set-textarea" id="img-char-neg-prompt">${imgConfig.pollinations.charNegPrompt}</textarea>
                            <div style="text-align:right; margin-top:5px;">
                                <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-char-neg-prompt').value='bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text'">[重置為預設]</span>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🐾 寵物圖片底詞 <span style="font-size:10px; color:#B78456; font-weight:normal;">（寵物商店 / 合成）</span></div>
                            <textarea class="set-textarea" id="img-pet-prompt">${imgConfig.pollinations.petBasePrompt}</textarea>
                            <div style="font-size:11px; color:#B78456; margin-top:6px; line-height:1.5;">↑ 寵物專用，不影響人物頭像。角色底詞與寵物底詞完全分離。</div>
                            <div style="text-align:right; margin-top:5px;">
                                <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-pet-prompt').value='cute, 2D art, sticker style, simple background, white background, high quality'">[重置為預設]</span>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🚫 寵物負詞</div>
                            <textarea class="set-textarea" id="img-pet-neg-prompt">${imgConfig.pollinations.petNegPrompt}</textarea>
                            <div style="text-align:right; margin-top:5px;">
                                <span style="font-size:11px; color:#FBDFA2; cursor:pointer;" onclick="document.getElementById('img-pet-neg-prompt').value='bad anatomy, blurry, low quality, worst quality, human, person, watermark, text'">[重置為預設]</span>
                            </div>
                        </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">測試生成</div>
                            <input class="set-input" id="img-test-prompt" type="text" placeholder="輸入描述..." value="a handsome man holding a rose">
                            <div class="btn-test" id="img-test-btn" style="margin-top:10px;">🎨 生成預覽</div>
                            <div id="img-test-preview" style="margin-top:15px; display:none; text-align:center;">
                                <img id="img-test-image" style="max-width:100%; border-radius:4px; border:1px solid rgba(251,223,162,0.3);" />
                                <div id="img-test-url" style="font-size:11px; color:#B78456; margin-top:8px; word-break:break-all;"></div>
                            </div>
                        </div>
                    </div>

                    <div id="view-voice" class="tab-view hidden">

                        <div style="background:rgba(251,223,162,0.1); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid rgba(251,223,162,0.2);">
                            <div class="set-label" style="margin-bottom:6px;">
                                <span>🎙️ GPT-SoVITS TTS（VN 面板）</span>
                                <label class="toggle-switch"><input type="checkbox" id="sovits-vn-enabled" ${localStorage.getItem('vn_sovits_enabled') !== '0' ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">開啟後 VN 面板 [Char|...] 對話自動呼叫 GPT-SoVITS 插件合成語音。需先在 GPT-SoVITS 插件面板為角色綁定模型。</div>
                        </div>

                        <div style="background:rgba(251,223,162,0.1); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid rgba(251,223,162,0.2); font-size:12px; color:#FBDFA2;">
                            🎵 <b>Minimax TTS</b>：配置後，VN 面板 [Char|...] 對話自動合成語音。請至 Minimax 平台取得 API Key。
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span>🔊 語音合成（總開關）</span>
                                <label class="toggle-switch"><input type="checkbox" id="mm-enabled" ${minimaxConfig.enabled ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">也可以在 VN 面板右上角 <b>🎵</b> 按鈕隨時切換，不需要進設置、不需要刪 Key。關閉後立即停止播放。</div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">服務區域</div>
                            <select class="set-select" id="mm-provider">
                                <option value="cn" ${minimaxConfig.provider === 'cn' ? 'selected' : ''}>🇨🇳 國內版 (api.minimaxi.com)</option>
                                <option value="io" ${minimaxConfig.provider === 'io' ? 'selected' : ''}>🌍 海外版 (api.minimax.io)</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-label">Group ID <span style="font-size:11px; color:#fc8181;">(必填)</span></div>
                            <input class="set-input" id="mm-group-id" type="text" placeholder="請輸入 Minimax Group ID..." value="${minimaxConfig.groupId || ''}">
                            <div class="set-desc">登入 Minimax 平台後，在帳號設定頁面可找到 Group ID。</div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">API Key <span style="font-size:11px; color:#fc8181;">(必填)</span></div>
                            <input class="set-input" id="mm-api-key" type="password" placeholder="請輸入 Minimax API Key..." value="${minimaxConfig.apiKey || ''}">
                        </div>

                        <div class="set-group">
                            <div class="set-label">語音模型</div>
                            <select class="set-select" id="mm-speech-model">
                                <option value="speech-2.8-hd"    ${minimaxConfig.speechModel === 'speech-2.8-hd'    ? 'selected' : ''}>speech-2.8-hd ✨ (支援語氣詞)</option>
                                <option value="speech-2.8-turbo" ${minimaxConfig.speechModel === 'speech-2.8-turbo' ? 'selected' : ''}>speech-2.8-turbo ✨ (支援語氣詞)</option>
                                <option value="speech-2.6-hd"    ${minimaxConfig.speechModel === 'speech-2.6-hd'    ? 'selected' : ''}>speech-2.6-hd</option>
                                <option value="speech-2.6-turbo" ${minimaxConfig.speechModel === 'speech-2.6-turbo' ? 'selected' : ''}>speech-2.6-turbo</option>
                                <option value="speech-02-hd"     ${minimaxConfig.speechModel === 'speech-02-hd'     ? 'selected' : ''}>speech-02-hd</option>
                                <option value="speech-02-turbo"  ${minimaxConfig.speechModel === 'speech-02-turbo'  ? 'selected' : ''}>speech-02-turbo (預設)</option>
                                <option value="speech-01-turbo"  ${minimaxConfig.speechModel === 'speech-01-turbo'  ? 'selected' : ''}>speech-01-turbo</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>預設語速</span><span class="set-slider-val" id="mm-speed-val">${(minimaxConfig.defaultSpeed ?? 1.0).toFixed(1)}</span></div>
                                <input type="range" min="0.5" max="2" step="0.1" value="${minimaxConfig.defaultSpeed ?? 1.0}" class="set-slider" id="mm-speed">
                            </div>
                            <div style="margin-top:15px;">
                                <div class="set-label">語言增強</div>
                                <select class="set-select" id="mm-lang-boost">
                                    <option value=""          ${ !minimaxConfig.defaultLanguageBoost          ? 'selected' : ''}>無（自動判斷）</option>
                                    <option value="auto"      ${minimaxConfig.defaultLanguageBoost==='auto'      ? 'selected' : ''}>自動判斷</option>
                                    <option value="Chinese"   ${minimaxConfig.defaultLanguageBoost==='Chinese'   ? 'selected' : ''}>中文普通話</option>
                                    <option value="Cantonese" ${minimaxConfig.defaultLanguageBoost==='Cantonese' ? 'selected' : ''}>粵語</option>
                                    <option value="Japanese"  ${minimaxConfig.defaultLanguageBoost==='Japanese'  ? 'selected' : ''}>日文</option>
                                    <option value="English"   ${minimaxConfig.defaultLanguageBoost==='English'   ? 'selected' : ''}>英文</option>
                                </select>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🎭 音色設定檔 <span style="font-size:11px; color:#B78456; font-weight:normal;">（VN / wx 面板通用）</span></div>
                            <div class="set-desc">每個角色可設定「顯示名稱」、「Minimax 音色ID」與多個「別名」。VN 面板輸出的角色名會自動比對所有別名（大小寫不敏感），找到後播放對應音色。</div>
                            <div id="mm-profile-list" style="display:flex; flex-direction:column; gap:12px; margin-top:12px;"></div>
                            <div style="display:flex; gap:8px; margin-top:12px;">
                                <div class="btn-test" id="mm-add-profile-btn" style="flex:1;">＋ 新增音色設定檔</div>
                                <div class="btn-test" id="mm-browse-voices-btn" style="flex:1; background:rgba(69,34,22,0.9);">🔍 瀏覽官方音色庫</div>
                            </div>
                        </div>

                        <div id="mm-voice-modal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(26,13,10,0.85); align-items:center; justify-content:center;">
                            <div style="background:rgba(69,34,22,0.95); border:1px solid rgba(251,223,162,0.4); border-radius:8px; padding:16px; width:92%; max-width:480px; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <div style="font-weight:bold; color:#FBDFA2; font-size:14px;">🎵 官方音色庫 <span id="mm-voice-count" style="font-size:11px; color:#B78456; font-weight:normal;"></span></div>
                                    <span id="mm-voice-modal-close" style="cursor:pointer; color:#FBDFA2; font-size:20px; line-height:1; padding:0 4px;">✕</span>
                                </div>
                                <input id="mm-voice-search" class="set-input" placeholder="搜尋 voice_id 或描述..." style="margin-bottom:8px;">
                                <div id="mm-voice-list" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:6px; padding-right:4px;"></div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔌 測試語音</div>
                            <div style="display:flex; gap:8px; margin-bottom:10px;">
                                <input class="set-input" id="mm-test-voice-id" type="text" placeholder="語音 ID，例如：male-01" style="flex:1;">
                            </div>
                            <input class="set-input" id="mm-test-text" type="text" placeholder="測試文字" value="你好，我是AI語音助手，測試一下。" style="margin-bottom:10px;">
                            <div class="btn-test" id="mm-test-btn">🎵 播放測試語音</div>
                            <div class="btn-test" id="mm-stop-btn" style="margin-top:8px; display:none;">⏹ 停止播放</div>
                            <div id="mm-test-result" style="display:none; margin-top:10px; background:rgba(69,34,22,0.8); border-radius:4px; padding:12px; font-size:12px; color:#FFF8E7; font-family:monospace; word-break:break-all;"></div>
                        </div>
                    </div>

                    <div id="view-sys" class="tab-view hidden">

                        <div class="set-group">
                            <div class="set-label">🖥️ 介面佈局 (解決頂部遮擋)</div>
                            <div class="set-desc">在 iOS 加到主畫面 (PWA) 時，若遇到動態島或瀏海遮擋頂部 UI，可開啟「強制下移」。</div>
                            <select class="set-select" id="os-layout-mode">
                                <option value="auto" ${localStorage.getItem('aurelia_layout_mode') !== 'pad-ios' ? 'selected' : ''}>📱 自動適配 (Auto/預設)</option>
                                <option value="pad-ios" ${localStorage.getItem('aurelia_layout_mode') === 'pad-ios' ? 'selected' : ''}>🍎 強制下移 (iOS 動態島/瀏海)</option>
                            </select>
                        </div>

                        <div style="background:rgba(251,223,162,0.1); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid rgba(251,223,162,0.2); font-size:12px; color:#FBDFA2;">
                            ☁️ 備份會將世界書、寵物、成就、App 設定等<b>輕量資料</b>同步至 GitHub Gist。
                            大型資料（寵物日誌、未來 VN 存檔等）請使用「本地全量匯出」。
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔑 GitHub Gist 設定</div>
                            <div class="set-desc">申請 <b>gist</b> 權限的 Personal Access Token（Settings → Developer settings → Fine-grained tokens）。首次備份後 Gist ID 自動保存。</div>
                            <input class="set-input" id="bk-token" type="password" placeholder="ghp_xxxxxxxxxxxx（不會備份 Token 本身）" />
                            <input class="set-input" id="bk-gist-id" placeholder="Gist ID（首次留空，備份後自動填入）" style="margin-top:8px;" />
                            <div id="bk-gist-hint" style="font-size:11px; color:#FBDFA2; margin-top:6px; word-break:break-all;"></div>
                            <div style="display:flex; gap:8px; margin-top:10px;">
                                <div class="btn-save" id="bk-gist-save-btn" style="flex:1; padding:12px; font-size:13px;">☁️ 備份到 Gist</div>
                                <div class="btn-test" id="bk-gist-restore-btn" style="flex:1;">⬇️ 從 Gist 還原</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                📊 本地儲存空間
                                <span class="btn-test" id="bk-scan-btn" style="padding:4px 12px; font-size:11px; cursor:pointer; margin:0;">掃描</span>
                            </div>
                            <div id="bk-storage-info" style="font-size:12px; color:#B78456; margin-top:8px;">點擊「掃描」查看各資料佔用量</div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">💾 本地全量備份</div>
                            <div class="set-desc">匯出包含所有 IndexedDB 資料的 JSON 檔案，可保存至手機相簿/iCloud/Google Drive。未來 VN 故事存檔也會一併匯出。</div>
                            <div class="btn-save" id="bk-export-btn" style="padding:12px; font-size:13px;">📤 匯出完整備份 JSON</div>
                            <div class="btn-test" id="bk-import-btn" style="margin-top:8px;">📥 從本地 JSON 還原</div>
                            <input type="file" id="bk-file-input" accept=".json" style="display:none;" />
                        </div>

                        <div class="danger-zone">
                            <h3><i class="fa-solid fa-triangle-exclamation"></i> 危險區域：一鍵格式化</h3>
                            <p>此操作將徹底刪除所有本地資料庫（包含角色、對話、長線劇情、變數工坊、寵物與系統設定）。操作後將自動重整網頁。請務必先進行備份！</p>
                            <div class="btn-danger" id="bk-format-btn">💥 格式化並清空所有數據</div>
                        </div>

                        <div id="bk-status" style="font-size:12px; color:#B78456; text-align:center; padding:10px 0; min-height:20px;"></div>
                    </div>

                    <div class="btn-save" id="os-save-btn">保存所有設定</div>
                    <div class="set-status" id="os-status"></div>
                </div>
            </div>
        `;

        const backBtn = container.querySelector('#nav-home');
        backBtn.onclick = () => { const win = window.parent || window; if (win.PhoneSystem) win.PhoneSystem.goHome(); };

        const tabs = container.querySelectorAll('.set-tab');
        const views = container.querySelectorAll('.tab-view');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));
                views.forEach(v => v.classList.add('hidden'));
                tab.classList.add('active');
                const targetId = `view-${tab.dataset.tab}`;
                const targetView = container.querySelector(`#${targetId}`);
                if (targetView) { targetView.classList.remove('hidden'); targetView.classList.add('active'); }
            };
        });

        // 備份分頁
        bindBackupTab(container);

        // 綁定元素 (主模型)
        const elSystemApi = container.querySelector('#os-system-api');
        const stProfileGroup = container.querySelector('#st-profile-group');
        const manualGroup = container.querySelector('#manual-api-group');
        const elStProfile = container.querySelector('#os-st-profile');
        const elUrl = container.querySelector('#os-api-url');
        const elKey = container.querySelector('#os-api-key');
        const elModel = container.querySelector('#os-api-model');
        const elMaxTokens = container.querySelector('#os-max-tokens');
        const elTemp = container.querySelector('#os-temperature');
        const elTopP = container.querySelector('#os-top-p');
        const elFreqPenalty = container.querySelector('#os-freq-penalty');
        const elPresPenalty = container.querySelector('#os-pres-penalty');
        const elEnableThinking = container.querySelector('#os-enable-thinking');
        const elThinkingBudget = container.querySelector('#os-thinking-budget');
        const elThinkBudgetVal = container.querySelector('#val-think-budget');
        const thinkBudgetGroup = container.querySelector('#thinking-budget-group');
        const elSummaryMode = container.querySelector('#os-summary-mode');
        const elUsePresetPrompts = container.querySelector('#os-use-preset-prompts');
        const valTemp = container.querySelector('#val-temp');
        const valTopP = container.querySelector('#val-topp');
        const valFreq = container.querySelector('#val-freq');
        const valPres = container.querySelector('#val-pres');

        // 綁定元素 (副模型)
        const secSystemApi = container.querySelector('#sec-system-api');
        const secProfileGroup = container.querySelector('#sec-st-profile-group');
        const secManualGroup = container.querySelector('#sec-manual-api-group');
        const secSyncPrimary = container.querySelector('#sec-sync-primary');
        const secSyncGroup = container.querySelector('#sec-sync-primary-group');
        const secStProfile = container.querySelector('#sec-st-profile');
        const secUrl = container.querySelector('#sec-api-url');
        const secKey = container.querySelector('#sec-api-key');
        const secModel = container.querySelector('#sec-api-model');
        const secMaxTokens = container.querySelector('#sec-max-tokens');
        const secTemp = container.querySelector('#sec-temperature');
        const secTopP = container.querySelector('#sec-top-p');
        const secFreqPenalty = container.querySelector('#sec-freq-penalty');
        const secPresPenalty = container.querySelector('#sec-pres-penalty');
        const secSummaryMode = container.querySelector('#sec-summary-mode');
        const secUsePresetPrompts = container.querySelector('#sec-use-preset-prompts');
        const elPresetName       = container.querySelector('#os-preset-name');
        const elPresetNameGroup  = container.querySelector('#os-preset-name-group');
        const elPresetRefresh    = container.querySelector('#os-preset-refresh-btn');
        const secPresetName      = container.querySelector('#sec-preset-name');
        const secPresetNameGroup = container.querySelector('#sec-preset-name-group');
        const secPresetRefresh   = container.querySelector('#sec-preset-refresh-btn');
        const secValTemp = container.querySelector('#sec-val-temp');
        const secValTopP = container.querySelector('#sec-val-topp');
        const secValFreq = container.querySelector('#sec-val-freq');
        const secValPres = container.querySelector('#sec-val-pres');

        // 綁定元素 (圖片)
        const elImgService = container.querySelector('#img-service');
        const elPolGroup = container.querySelector('#img-group-pollinations');
        const elPolApiKey = container.querySelector('#img-pol-apikey');
        const elPolModel = container.querySelector('#img-pol-model');
        const elPolSize = container.querySelector('#img-pol-size');
        const elNaiGroup = container.querySelector('#img-group-nai');
        const elNaiToken = container.querySelector('#img-nai-token');
        const elNaiModel = container.querySelector('#img-nai-model');
        const elStylePrompt = container.querySelector('#img-style-prompt');
        const elCharNegPrompt = container.querySelector('#img-char-neg-prompt');
        const elPetPrompt = container.querySelector('#img-pet-prompt');
        const elPetNegPrompt = container.querySelector('#img-pet-neg-prompt');
        const elImgTestPrompt = container.querySelector('#img-test-prompt');
        const btnImgTest = container.querySelector('#img-test-btn');
        const imgTestPreview = container.querySelector('#img-test-preview');
        const imgTestImage = container.querySelector('#img-test-image');
        const imgTestUrl = container.querySelector('#img-test-url');

        // 按鈕
        const btnFetch = container.querySelector('#os-fetch-btn');
        const secFetch = container.querySelector('#sec-fetch-btn');
        const btnSave = container.querySelector('#os-save-btn');
        const btnTest = container.querySelector('#os-test-btn');
        const secTestBtn = container.querySelector('#sec-test-btn');
        const status = container.querySelector('#os-status');

        // Sliders Listeners
        elTemp.oninput = () => valTemp.innerText = parseFloat(elTemp.value).toFixed(2);
        elTopP.oninput = () => valTopP.innerText = parseFloat(elTopP.value).toFixed(2);
        elFreqPenalty.oninput = () => valFreq.innerText = parseFloat(elFreqPenalty.value).toFixed(2);
        elPresPenalty.oninput = () => valPres.innerText = parseFloat(elPresPenalty.value).toFixed(2);

        if (elEnableThinking) {
            elEnableThinking.onchange = () => {
                if (thinkBudgetGroup) thinkBudgetGroup.classList.toggle('hidden', !elEnableThinking.checked);
            };
        }
        if (elThinkingBudget && elThinkBudgetVal) {
            elThinkingBudget.oninput = () => { elThinkBudgetVal.innerText = parseInt(elThinkingBudget.value).toLocaleString(); };
        }
        
        secTemp.oninput = () => secValTemp.innerText = parseFloat(secTemp.value).toFixed(2);
        secTopP.oninput = () => secValTopP.innerText = parseFloat(secTopP.value).toFixed(2);
        secFreqPenalty.oninput = () => secValFreq.innerText = parseFloat(secFreqPenalty.value).toFixed(2);
        secPresPenalty.oninput = () => secValPres.innerText = parseFloat(secPresPenalty.value).toFixed(2);

        // Toggle Logic
        const toggleInputs = (sysApi, manGroup, profGroup) => {
            if (sysApi.checked) { manGroup.style.display = 'none'; profGroup.classList.remove('hidden'); } 
            else { manGroup.style.display = 'flex'; profGroup.classList.add('hidden'); }
        };
        
        const elModelRow = container.querySelector('#model-row');
        const elModelNotice = container.querySelector('#model-system-notice');
        const secModelRow = container.querySelector('#sec-model-row');
        const secModelNotice = container.querySelector('#sec-model-system-notice');

        const toggleModelRow = (isSystem, row, notice) => {
            if (isSystem) { row.classList.add('hidden'); notice.classList.remove('hidden'); }
            else { row.classList.remove('hidden'); notice.classList.add('hidden'); }
        };

        elSystemApi.onchange = () => {
            toggleInputs(elSystemApi, manualGroup, stProfileGroup);
            toggleModelRow(elSystemApi.checked, elModelRow, elModelNotice);
        };
        toggleInputs(elSystemApi, manualGroup, stProfileGroup);
        toggleModelRow(elSystemApi.checked, elModelRow, elModelNotice);

        // 🔥 副模型特有的 Toggle 邏輯
        secSystemApi.onchange = () => {
            toggleInputs(secSystemApi, secManualGroup, secProfileGroup);
            toggleModelRow(secSystemApi.checked, secModelRow, secModelNotice);
            if (secSyncGroup) secSyncGroup.style.display = secSystemApi.checked ? 'none' : 'flex';
            if (!secSystemApi.checked && secSyncPrimary && secSyncPrimary.checked) {
                secManualGroup.style.display = 'none';
            }
        };
        
        if (secSyncPrimary) {
            secSyncPrimary.onchange = () => {
                if (secSyncPrimary.checked) {
                    secManualGroup.style.display = 'none';
                } else if (!secSystemApi.checked) {
                    secManualGroup.style.display = 'flex';
                }
            };
            if (!secSystemApi.checked) {
                secManualGroup.style.display = secSyncPrimary.checked ? 'none' : 'flex';
            }
        }
        
        toggleInputs(secSystemApi, secManualGroup, secProfileGroup);
        toggleModelRow(secSystemApi.checked, secModelRow, secModelNotice);
        if (secSyncGroup) secSyncGroup.style.display = secSystemApi.checked ? 'none' : 'flex';
        if (!secSystemApi.checked && secSyncPrimary && secSyncPrimary.checked) secManualGroup.style.display = 'none';

        // --- Preset 名稱選擇器 ---
        function populatePresetSelect(selectEl, currentName) {
            const th = window.TavernHelper || window.parent?.TavernHelper;
            if (!th || typeof th.getPresetNames !== 'function') {
                selectEl.innerHTML = '<option value="">（TavernHelper 不可用）</option>';
                return;
            }
            try {
                const names = th.getPresetNames();
                selectEl.innerHTML = '<option value="">（使用當前 in_use Preset）</option>' +
                    names.map(n => `<option value="${n}" ${n === currentName ? 'selected' : ''}>${n}</option>`).join('');
            } catch(e) {
                selectEl.innerHTML = '<option value="">（讀取失敗）</option>';
            }
        }

        if (elPresetName && llmConfig.usePresetPrompts)   populatePresetSelect(elPresetName,  llmConfig.presetName  || '');
        if (secPresetName && secLlmConfig.usePresetPrompts) populatePresetSelect(secPresetName, secLlmConfig.presetName || '');

        if (elUsePresetPrompts) elUsePresetPrompts.onchange = () => {
            if (elPresetNameGroup) elPresetNameGroup.style.display = elUsePresetPrompts.checked ? 'flex' : 'none';
            if (elUsePresetPrompts.checked && elPresetName) populatePresetSelect(elPresetName, llmConfig.presetName || '');
        };
        if (secUsePresetPrompts) secUsePresetPrompts.onchange = () => {
            if (secPresetNameGroup) secPresetNameGroup.style.display = secUsePresetPrompts.checked ? 'flex' : 'none';
            if (secUsePresetPrompts.checked && secPresetName) populatePresetSelect(secPresetName, secLlmConfig.presetName || '');
        };

        if (elPresetRefresh)  elPresetRefresh.onclick  = () => elPresetName  && populatePresetSelect(elPresetName,  elPresetName.value);
        if (secPresetRefresh) secPresetRefresh.onclick = () => secPresetName && populatePresetSelect(secPresetName, secPresetName.value);

        // --- Profile URL Info ---
        function showProfileInfo(selectEl, infoEl) {
            if (!infoEl) return;
            const selectedId = selectEl.value;
            if (!selectedId) {
                infoEl.innerHTML = '<span>ℹ️ 使用當前激活的 ST 連接</span>';
                return;
            }
            const p = stProfiles.find(x => x.id === selectedId);
            if (!p) { infoEl.textContent = '(找不到 Profile)'; return; }
            const url = p['api-url'] || '(URL 未記錄)';
            const liveModel = (() => { try { return getSTContext()?.getChatCompletionModel?.() || ''; } catch(_) { return ''; } })();
            const model = liveModel || p.model || '(模型未記錄)';
            const api = p.api ? ` <span>[${p.api}]</span>` : '';
            infoEl.innerHTML = `🌐 ${url}<br>🤖 ${model}${api}`;
        }

        const profileInfoEl = container.querySelector('#st-profile-info');
        const secProfileInfoEl = container.querySelector('#sec-st-profile-info');
        showProfileInfo(elStProfile, profileInfoEl);
        showProfileInfo(secStProfile, secProfileInfoEl);
        elStProfile.addEventListener('change', () => showProfileInfo(elStProfile, profileInfoEl));
        secStProfile.addEventListener('change', () => showProfileInfo(secStProfile, secProfileInfoEl));

        function updateSmeaVisibility(model) {
            const isV3 = model === 'nai-diffusion-3';
            const smeaGrp    = container.querySelector('#img-nai-smea-group');
            const smeaDynGrp = container.querySelector('#img-nai-smea-dyn-group');
            if (smeaGrp)    { smeaGrp.style.opacity    = isV3 ? '1' : '0.35'; smeaGrp.style.pointerEvents    = isV3 ? '' : 'none'; }
            if (smeaDynGrp) { smeaDynGrp.style.opacity = isV3 ? '1' : '0.35'; smeaDynGrp.style.pointerEvents = isV3 ? '' : 'none'; }
        }
        if (elNaiModel) elNaiModel.onchange = () => updateSmeaVisibility(elNaiModel.value);

        elImgService.onchange = () => {
            const isNai = elImgService.value === 'novelai';
            elNaiGroup.classList.toggle('hidden', !isNai);
            elPolGroup.classList.toggle('hidden', isNai);
            const elPolPrompts = container.querySelector('#img-pol-prompts-group');
            if (elPolPrompts) elPolPrompts.classList.toggle('hidden', isNai);
        };

        // Fetch Logic (Primary)
        btnFetch.onclick = async () => {
            btnFetch.style.animation = "spin 1s linear infinite";
            status.innerText = "⏳ 正在獲取模型列表...";
            
            try {
                if (elSystemApi.checked) {
                    const win = window.parent;
                    let foundModel = win.oai_settings?.openai_model || win.settings?.makersuite_model;
                    if (!foundModel) {
                        const domSelect = win.document.querySelector('#model_openai_select');
                        if (domSelect) foundModel = domSelect.value;
                    }
                    if (foundModel) {
                        elModel.innerHTML = `<option value="${foundModel}" selected>${foundModel}</option>`;
                        status.innerText = `✅ 已同步 (系統): ${foundModel}`;
                    } else {
                        throw new Error("無法讀取酒館模型");
                    }
                } 
                else {
                    const url = elUrl.value.trim();
                    const key = elKey.value.trim();
                    if (!url) throw new Error("請輸入 API 地址");

                    let fetchUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '') + '/v1/models';
                    const res = await fetch(fetchUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } });
                    
                    if (!res.ok) throw new Error(`API 錯誤: ${res.status}`);
                    
                    const data = await res.json();
                    let models = data.data || data.models || [];
                    
                    if (models.length > 0) {
                        elModel.innerHTML = '';
                        models.forEach(m => { 
                            const id = m.id || m;
                            elModel.innerHTML += `<option value="${id}">${id}</option>`; 
                        });
                        status.innerText = `✅ 成功獲取 ${models.length} 個模型`;
                    } else {
                        throw new Error("API 返回了空列表");
                    }
                }
            } catch (e) {
                console.error(e);
                status.innerText = `❌ 同步失敗: ${e.message}`;
            } finally {
                btnFetch.style.animation = "none";
            }
        };

        // Fetch Logic (Secondary)
        secFetch.onclick = async () => {
            secFetch.style.animation = "spin 1s linear infinite";
            status.innerText = "⏳ 正在獲取副模型列表...";
            
            try {
                if (secSystemApi.checked) {
                    const win = window.parent;
                    let foundModel = win.oai_settings?.openai_model || win.settings?.makersuite_model;
                    if (!foundModel) {
                        const domSelect = win.document.querySelector('#model_openai_select');
                        if (domSelect) foundModel = domSelect.value;
                    }
                    if (foundModel) {
                        secModel.innerHTML = `<option value="${foundModel}" selected>${foundModel}</option>`;
                        status.innerText = `✅ 副模型已同步 (系統): ${foundModel}`;
                    } else {
                        throw new Error("無法讀取酒館模型");
                    }
                } 
                else {
                    // 🔥 自動根據同步拉桿決定取用哪組 URL/Key
                    const isSync = secSyncPrimary && secSyncPrimary.checked;
                    const url = isSync ? elUrl.value.trim() : secUrl.value.trim();  
                    const key = isSync ? elKey.value.trim() : secKey.value.trim();  
                    
                    if (!url) throw new Error("請輸入副模型 API 地址");

                    let fetchUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '') + '/v1/models';
                    const res = await fetch(fetchUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } });
                    
                    if (!res.ok) throw new Error(`API 錯誤: ${res.status}`);
                    
                    const data = await res.json();
                    let models = data.data || data.models || [];
                    
                    if (models.length > 0) {
                        secModel.innerHTML = ''; 
                        models.forEach(m => { 
                            const id = m.id || m;
                            secModel.innerHTML += `<option value="${id}">${id}</option>`; 
                        });
                        status.innerText = `✅ 副模型列表更新成功 (${models.length})`;
                    } else {
                        throw new Error("API 返回空列表");
                    }
                }

            } catch (e) {
                console.error(e);
                status.innerText = `❌ 副模型同步失敗: ${e.message}`;
            } finally {
                secFetch.style.animation = "none";
            }
        };

        btnSave.onclick = () => {
            try {
                const layoutMode = container.querySelector('#os-layout-mode')?.value || 'auto';
                localStorage.setItem('aurelia_layout_mode', layoutMode);
                const targetDocs = [document];
                if (window.parent && window.parent.document) targetDocs.push(window.parent.document);
                targetDocs.forEach(d => {
                    if (layoutMode === 'pad-ios') {
                        d.body.classList.add('layout-pad-ios');
                    } else {
                        d.body.classList.remove('layout-pad-ios');
                    }
                });
                
                const header = container.querySelector('.set-header');
                if (header) {
                    if (layoutMode === 'pad-ios') {
                        header.style.setProperty('padding-top', '55px', 'important');
                    } else {
                        header.style.removeProperty('padding-top');
                    }
                }

                const llmData = {
                    useSystemApi: elSystemApi.checked,
                    stProfileId: elStProfile.value,
                    url: elUrl.value.trim(),
                    key: elKey.value.trim(),
                    model: elModel.value,
                    enableSummaryOnly: elSummaryMode ? elSummaryMode.checked : false,
                    usePresetPrompts: elUsePresetPrompts ? elUsePresetPrompts.checked : false,
                    presetName: (elPresetName ? elPresetName.value : '') || '',
                    maxTokens: parseInt(elMaxTokens.value),
                    temperature: parseFloat(elTemp.value),
                    top_p: parseFloat(elTopP.value),
                    frequency_penalty: parseFloat(elFreqPenalty.value),
                    presence_penalty: parseFloat(elPresPenalty.value),
                    enableThinking: elEnableThinking ? elEnableThinking.checked : false,
                    thinkingBudget: elThinkingBudget ? parseInt(elThinkingBudget.value) : 8000,
                    directMode: false, enableStreaming: false, disableTyping: false
                };

                // 🔥 自動根據同步拉桿，存儲對應的 URL/Key
                const isSecSync = secSyncPrimary ? secSyncPrimary.checked : false;
                const secLlmData = {
                    useSystemApi: secSystemApi.checked,
                    stProfileId: secStProfile.value,
                    syncWithPrimary: isSecSync,
                    url: isSecSync ? elUrl.value.trim() : secUrl.value.trim(),
                    key: isSecSync ? elKey.value.trim() : secKey.value.trim(),
                    model: secModel.value,
                    enableSummaryOnly: secSummaryMode ? secSummaryMode.checked : false,
                    usePresetPrompts: secUsePresetPrompts ? secUsePresetPrompts.checked : false,
                    presetName: (secPresetName ? secPresetName.value : '') || '',
                    maxTokens: parseInt(secMaxTokens.value),
                    temperature: parseFloat(secTemp.value),
                    top_p: parseFloat(secTopP.value),
                    frequency_penalty: parseFloat(secFreqPenalty.value),
                    presence_penalty: parseFloat(secPresPenalty.value),
                    directMode: false, enableStreaming: false, disableTyping: false
                };

                const imgData = {
                    service: elImgService.value,
                    pollinations: {
                        url: 'https://gen.pollinations.ai/image',
                        apiKey: elPolApiKey.value.trim(),
                        model: elPolModel.value,
                        size: elPolSize.value,
                        models: imgConfig.pollinations.models || {},
                        charBasePrompt: elStylePrompt.value.trim(),
                        charNegPrompt: elCharNegPrompt.value.trim(),
                        petBasePrompt: elPetPrompt.value.trim(),
                        petNegPrompt: elPetNegPrompt.value.trim(),
                        itemBasePrompt: imgConfig.pollinations.itemBasePrompt,
                        itemNegPrompt: imgConfig.pollinations.itemNegPrompt
                    },
                    novelai: {
                        token: elNaiToken.value.trim(),
                        url: 'https://image.novelai.net/ai/generate-image',
                        model: elNaiModel ? elNaiModel.value : 'nai-diffusion-3',
                        sampler:       (container.querySelector('#img-nai-sampler')?.value        || 'k_euler_ancestral'),
                        scale:         parseFloat(container.querySelector('#img-nai-scale')?.value  ?? 5),
                        steps:         parseInt(container.querySelector('#img-nai-steps')?.value    ?? 28),
                        ucPreset:      parseInt(container.querySelector('#img-nai-uc-preset')?.value ?? 1),
                        qualityToggle: container.querySelector('#img-nai-quality-toggle')?.checked ?? true,
                        smea:          container.querySelector('#img-nai-smea')?.checked ?? true,
                        smeaDyn:       container.querySelector('#img-nai-smea-dyn')?.checked ?? false,
                        charBasePrompt: (container.querySelector('#img-nai-char-base')?.value || '').trim(),
                        charNegPrompt:  (container.querySelector('#img-nai-char-neg')?.value  || '').trim(),
                        itemBasePrompt: (container.querySelector('#img-nai-item-base')?.value || '').trim(),
                        itemNegPrompt:  (container.querySelector('#img-nai-item-neg')?.value  || '').trim(),
                        naiPresets: naiPresets,
                    }
                };

                const mmGroupId   = container.querySelector('#mm-group-id');
                const mmApiKey    = container.querySelector('#mm-api-key');
                const mmProvider  = container.querySelector('#mm-provider');
                const mmModel     = container.querySelector('#mm-speech-model');
                const mmEnabled   = container.querySelector('#mm-enabled');
                const mmSpeed     = container.querySelector('#mm-speed');
                const mmLangBoost = container.querySelector('#mm-lang-boost');
                const voiceProfiles = [];
                container.querySelectorAll('.mm-profile-card').forEach(card => {
                    const label   = card.querySelector('.mm-p-label')?.value.trim();
                    const id      = card.querySelector('.mm-p-id')?.value.trim();
                    const aliases = [];
                    card.querySelectorAll('.mm-alias-chip').forEach(chip => {
                        const t = chip.dataset.alias;
                        if (t) aliases.push(t);
                    });
                    if (label && id) voiceProfiles.push({ label, id, aliases });
                });
                const minimaxData = mmGroupId ? {
                    enabled:              mmEnabled  ? mmEnabled.checked        : false,
                    groupId:              mmGroupId.value.trim(),
                    apiKey:               mmApiKey   ? mmApiKey.value.trim()      : '',
                    provider:             mmProvider ? mmProvider.value          : 'cn',
                    speechModel:          mmModel    ? mmModel.value             : 'speech-01-turbo',
                    defaultSpeed:         mmSpeed    ? parseFloat(mmSpeed.value) : 1.0,
                    defaultLanguageBoost: mmLangBoost ? mmLangBoost.value        : '',
                    voiceProfiles
                } : null;

                saveConfig(llmData, secLlmData, imgData, minimaxData); 
                btnSave.innerText = "已保存 ✓"; 
                status.innerText = "✅ 設置已生效"; 
                setTimeout(() => { btnSave.innerText = "保存所有設定"; }, 2000);
            } catch (e) {
                console.error("保存失敗:", e);
                status.innerText = `❌ 保存失敗: ${e.message}`; 
            }
        };

        // --- Test API Logic (共用) ---
        async function runApiTest(cfg, modelVal, resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color = '#B78456';
            resultEl.textContent = '⏳ 測試中...';
            try {
                let replyText = '';
                const win = window.parent || window;
                const doc = win.document;

                if (cfg.useSystemApi) {
                    const context = win.SillyTavern?.getContext?.();
                    if (!context) throw new Error('無法取得 ST Context');

                    if (cfg.stProfileId) {
                        const profilesSelect = doc.getElementById('connection_profiles');
                        if (!profilesSelect) throw new Error('找不到 ST 連線設定選單 (#connection_profiles)');

                        const originalProfileId = profilesSelect.value;
                        const needSwitch = (originalProfileId !== cfg.stProfileId);

                        if (needSwitch) {
                            profilesSelect.value = cfg.stProfileId;
                            await new Promise((resolve, reject) => {
                                const timeout = setTimeout(() => reject(new Error('切換設定檔逾時 (10秒)')), 10000);
                                context.eventSource.once(context.eventTypes.CONNECTION_PROFILE_LOADED, () => {
                                    clearTimeout(timeout);
                                    resolve();
                                });
                                profilesSelect.dispatchEvent(new Event('change'));
                            });
                        }

                        let response;
                        try {
                            response = await context.ConnectionManagerRequestService.sendRequest(
                                cfg.stProfileId,
                                [{ role: 'user', content: 'Hi' }],
                                50
                            );
                        } finally {
                            if (needSwitch) {
                                profilesSelect.value = originalProfileId || '';
                                profilesSelect.dispatchEvent(new Event('change'));
                            }
                        }
                        replyText = response?.choices?.[0]?.message?.content || JSON.stringify(response);
                    } else {
                        const headers = context.getRequestHeaders();
                        const res = await fetch('/api/backends/chat-completions/generate', {
                            method: 'POST',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], max_tokens: 50, stream: false })
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const data = await res.json();
                        replyText = data?.choices?.[0]?.message?.content || data?.content || JSON.stringify(data);
                    }
                } else {
                    if (!cfg.url) throw new Error('請先填寫 API 地址');
                    let targetUrl = cfg.url.replace(/\/$/, '');
                    if (!targetUrl.includes('/chat/completions')) targetUrl += (targetUrl.endsWith('/v1') ? '' : '/v1') + '/chat/completions';
                    const res = await fetch(targetUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
                        body: JSON.stringify({ model: modelVal, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 50, stream: false })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    const data = await res.json();
                    replyText = data?.choices?.[0]?.message?.content || data?.content || JSON.stringify(data);
                }

                resultEl.style.color = '#FBDFA2';
                resultEl.textContent = '✅ 回應: ' + replyText;
                status.innerText = '✅ API 連線成功';
            } catch (e) {
                resultEl.style.color = '#fc8181';
                resultEl.textContent = '❌ 錯誤: ' + e.message;
                status.innerText = '❌ API 測試失敗'; 
            }
        }

        btnTest.onclick = async () => {
            btnTest.style.opacity = '0.5'; btnTest.textContent = '⏳ 測試中...';
            await runApiTest(
                { useSystemApi: elSystemApi.checked, stProfileId: elStProfile.value, url: elUrl.value.trim(), key: elKey.value.trim() },
                elModel.value,
                container.querySelector('#os-test-result')
            );
            btnTest.style.opacity = '1'; btnTest.textContent = '🔌 發送測試訊息';
        };

        // 🔥 副模型測試：自動判斷是否使用同步的 URL/Key
        secTestBtn.onclick = async () => {
            secTestBtn.style.opacity = '0.5'; secTestBtn.textContent = '⏳ 測試中...';
            const isSecSync = secSyncPrimary && secSyncPrimary.checked;
            const testUrl = isSecSync ? elUrl.value.trim() : secUrl.value.trim();
            const testKey = isSecSync ? elKey.value.trim() : secKey.value.trim();
            await runApiTest(
                { useSystemApi: secSystemApi.checked, stProfileId: secStProfile.value, url: testUrl, key: testKey },
                secModel.value,
                container.querySelector('#sec-test-result')
            );
            secTestBtn.style.opacity = '1'; secTestBtn.textContent = '🔌 發送測試訊息';
        };

        const sovitsToggle = container.querySelector('#sovits-vn-enabled');
        if (sovitsToggle) {
            sovitsToggle.onchange = () => {
                localStorage.setItem('vn_sovits_enabled', sovitsToggle.checked ? '1' : '0');
            };
        }

        const mmSpeedSlider = container.querySelector('#mm-speed');
        const mmSpeedVal    = container.querySelector('#mm-speed-val');
        if (mmSpeedSlider) {
            mmSpeedSlider.oninput = () => {
                mmSpeedVal.textContent = parseFloat(mmSpeedSlider.value).toFixed(1);
            };
        }

        let naiPresets = [...(imgConfig.novelai.naiPresets || [])];

        function refreshNaiPresetDropdown() {
            const sel = container.querySelector('#img-nai-preset-sel');
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">-- 選擇預設 --</option>' +
                naiPresets.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
            if (cur !== '' && naiPresets[parseInt(cur)]) sel.value = cur;
        }

        window._naiPreset = {
            apply() {
                const sel = container.querySelector('#img-nai-preset-sel');
                if (!sel || sel.value === '') { alert('請先選擇預設'); return; }
                const p = naiPresets[parseInt(sel.value)];
                if (!p) return;
                const set = (id, v) => { const el = container.querySelector(id); if (el) el.value = v; };
                set('#img-nai-char-base', p.charBasePrompt || '');
                set('#img-nai-char-neg',  p.charNegPrompt  || '');
                set('#img-nai-item-base', p.itemBasePrompt || '');
                set('#img-nai-item-neg',  p.itemNegPrompt  || '');
                if (p.sampler  !== undefined) set('#img-nai-sampler', p.sampler);
                if (p.scale    !== undefined) set('#img-nai-scale',   p.scale);
                if (p.steps    !== undefined) set('#img-nai-steps',   p.steps);
                if (p.ucPreset !== undefined) set('#img-nai-uc-preset', p.ucPreset);
            },
            save() {
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'block';
                container.querySelector('#img-nai-preset-name-input')?.focus();
            },
            confirmSave() {
                const nameInput = container.querySelector('#img-nai-preset-name-input');
                const name = nameInput?.value.trim();
                if (!name) { alert('請輸入預設名稱'); return; }
                const get = id => (container.querySelector(id)?.value || '').trim();
                const getNum = (id, def) => parseFloat(container.querySelector(id)?.value ?? def);
                const getInt = (id, def) => parseInt(container.querySelector(id)?.value ?? def);
                naiPresets.push({
                    name,
                    charBasePrompt: get('#img-nai-char-base'),
                    charNegPrompt:  get('#img-nai-char-neg'),
                    itemBasePrompt: get('#img-nai-item-base'),
                    itemNegPrompt:  get('#img-nai-item-neg'),
                    sampler:   get('#img-nai-sampler') || 'k_euler_ancestral',
                    scale:     getNum('#img-nai-scale', 5),
                    steps:     getInt('#img-nai-steps', 28),
                    ucPreset:  getInt('#img-nai-uc-preset', 1),
                });
                refreshNaiPresetDropdown();
                const sel = container.querySelector('#img-nai-preset-sel');
                if (sel) sel.value = String(naiPresets.length - 1);
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'none';
                if (nameInput) nameInput.value = '';
            },
            cancelSave() {
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'none';
                const nameInput = container.querySelector('#img-nai-preset-name-input');
                if (nameInput) nameInput.value = '';
            },
            del() {
                const sel = container.querySelector('#img-nai-preset-sel');
                if (!sel || sel.value === '') { alert('請先選擇要刪除的預設'); return; }
                const idx = parseInt(sel.value);
                const name = naiPresets[idx]?.name || '';
                if (!confirm(`刪除預設「${name}」？`)) return;
                naiPresets.splice(idx, 1);
                refreshNaiPresetDropdown();
            }
        };

        const mmProfileList = container.querySelector('#mm-profile-list');
        const mmAddProfileBtn = container.querySelector('#mm-add-profile-btn');

        function makeAliasChip(alias) {
            const chip = document.createElement('span');
            chip.className = 'mm-alias-chip';
            chip.dataset.alias = alias;
            chip.style.cssText = 'display:inline-flex; align-items:center; gap:4px; background:rgba(69,34,22,0.9); border:1px solid rgba(251,223,162,0.4); border-radius:20px; padding:3px 10px; font-size:12px; color:#FBDFA2; margin:2px;';
            chip.innerHTML = `${alias} <span style="cursor:pointer; color:#B78456; font-size:14px; line-height:1;" title="移除">×</span>`;
            chip.querySelector('span').onclick = () => chip.remove();
            return chip;
        }

        function makeProfileCard(profile = {}, expanded = false) {
            const card = document.createElement('div');
            card.className = 'mm-profile-card';
            card.style.cssText = 'background:rgba(69,34,22,0.6); border:1px solid rgba(251,223,162,0.3); border-radius:8px; overflow:hidden;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; align-items:center; gap:8px; padding:10px 14px; cursor:pointer; user-select:none;';
            header.innerHTML = `
                <span class="mm-p-arrow" style="color:#B78456; font-size:12px; transition:transform 0.2s; flex-shrink:0;">${expanded ? '▼' : '▶'}</span>
                <span class="mm-p-name-display" style="flex:1; font-weight:600; color:#FBDFA2; font-size:14px;">${profile.label || '（未命名）'}</span>
                <span style="flex-shrink:0; cursor:pointer; color:#fc8181; font-size:18px; padding:2px 4px;" title="刪除此音色">🗑</span>
            `;
            header.querySelector('span[title]').onclick = (e) => { e.stopPropagation(); card.remove(); };
            card.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = `padding:0 14px 14px; display:flex; flex-direction:column; gap:10px; ${expanded ? '' : 'display:none;'}`;
            body.style.display = expanded ? 'flex' : 'none';

            const nameRow = document.createElement('div');
            nameRow.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:4px;">角色名稱</div>
                <input class="set-input mm-p-label" type="text" placeholder="如：愛麗絲" value="${profile.label || ''}" style="font-weight:600; color:#FBDFA2;">`;
            const labelInput = nameRow.querySelector('.mm-p-label');
            const nameDisplay = header.querySelector('.mm-p-name-display');
            labelInput.addEventListener('input', () => {
                nameDisplay.textContent = labelInput.value.trim() || '（未命名）';
            });
            body.appendChild(nameRow);

            const idRow = document.createElement('div');
            idRow.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:4px;">Minimax 音色ID</div>
                <input class="set-input mm-p-id" type="text" placeholder="例如：female-shaonv" value="${profile.id || ''}">`;
            body.appendChild(idRow);

            const aliasSection = document.createElement('div');
            aliasSection.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:6px;">別名 <span style="color:#B78456; font-weight:normal;">（大小寫不敏感）</span></div>`;
            const chipContainer = document.createElement('div');
            chipContainer.style.cssText = 'display:flex; flex-wrap:wrap; gap:2px; min-height:28px; background:rgba(69,34,22,0.8); border:1px solid rgba(251,223,162,0.2); border-radius:4px; padding:6px; margin-bottom:6px;';
            (profile.aliases || []).forEach(a => chipContainer.appendChild(makeAliasChip(a)));

            const aliasAddRow = document.createElement('div');
            aliasAddRow.style.cssText = 'display:flex; gap:6px;';
            aliasAddRow.innerHTML = `
                <input class="set-input mm-p-alias-input" type="text" placeholder="輸入別名後按 Enter 或 ＋" style="flex:1; font-size:13px;">
                <div class="btn-fetch mm-p-alias-add" title="新增別名" style="font-size:18px; flex-shrink:0;">＋</div>
            `;
            const aliasInput = aliasAddRow.querySelector('.mm-p-alias-input');
            const aliasAdd   = aliasAddRow.querySelector('.mm-p-alias-add');
            function addAlias() {
                const v = aliasInput.value.trim();
                if (!v) return;
                chipContainer.appendChild(makeAliasChip(v));
                aliasInput.value = '';
            }
            aliasAdd.onclick = addAlias;
            aliasInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } });

            aliasSection.appendChild(chipContainer);
            aliasSection.appendChild(aliasAddRow);
            body.appendChild(aliasSection);
            card.appendChild(body);

            header.onclick = (e) => {
                if (e.target.title === '刪除此音色') return;
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'flex';
                header.querySelector('.mm-p-arrow').textContent = isOpen ? '▶' : '▼';
            };

            return card;
        }

        if (mmProfileList) {
            (minimaxConfig.voiceProfiles || []).forEach(p => {
                mmProfileList.appendChild(makeProfileCard(p, false));
            });
        }

        if (mmAddProfileBtn && mmProfileList) {
            mmAddProfileBtn.onclick = () => {
                const card = makeProfileCard({}, true);
                mmProfileList.appendChild(card);
                card.querySelector('.mm-p-label')?.focus();
            };
        }

        const mmBrowseBtn  = container.querySelector('#mm-browse-voices-btn');
        const mmVoiceModal = container.querySelector('#mm-voice-modal');
        const mmVoiceList  = container.querySelector('#mm-voice-list');
        const mmVoiceSearch= container.querySelector('#mm-voice-search');
        const mmVoiceCount = container.querySelector('#mm-voice-count');
        let _fetchedVoices = [];

        function renderVoiceList(voices) {
            if (!mmVoiceList) return;
            mmVoiceList.innerHTML = '';
            voices.forEach(v => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; background:rgba(69,34,22,0.8); border:1px solid rgba(251,223,162,0.2); border-radius:4px; padding:10px 12px; cursor:default;';
                const desc = Array.isArray(v.description) ? v.description[0] : (v.description || '');
                row.innerHTML = `
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; color:#FBDFA2;">${desc || v.voice_id}</div>
                        <div style="font-size:10px; color:#B78456; font-family:monospace; margin-top:3px; word-break:break-all;">${v.voice_id}</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px; flex-shrink:0;">
                        <button class="mm-v-use"   style="font-size:11px; background:rgba(120,55,25,0.8); border:1px solid rgba(251,223,162,0.3); color:#FBDFA2; border-radius:4px; padding:4px 8px; cursor:pointer; white-space:nowrap;">填入測試</button>
                        <button class="mm-v-add"   style="font-size:11px; background:rgba(251,223,162,0.15); border:1px solid #FBDFA2; color:#FBDFA2; border-radius:4px; padding:4px 8px; cursor:pointer; white-space:nowrap;">新增檔案</button>
                    </div>`;
                row.querySelector('.mm-v-use').onclick = () => {
                    const el = container.querySelector('#mm-test-voice-id');
                    if (el) { el.value = v.voice_id; el.dispatchEvent(new Event('input')); }
                    mmVoiceModal.style.display = 'none';
                };
                row.querySelector('.mm-v-add').onclick = () => {
                    const card = makeProfileCard({ id: v.voice_id, label: '' }, true);
                    mmProfileList.appendChild(card);
                    card.querySelector('.mm-p-label')?.focus();
                    mmVoiceModal.style.display = 'none';
                };
                mmVoiceList.appendChild(row);
            });
        }

        if (mmBrowseBtn && mmVoiceModal) {
            mmBrowseBtn.onclick = async () => {
                const groupId = (container.querySelector('#mm-group-id')?.value || '').trim();
                const apiKey  = (container.querySelector('#mm-api-key')?.value  || '').trim();
                const provider = container.querySelector('#mm-provider')?.value || 'cn';
                if (!groupId || !apiKey) {
                    alert('請先填寫 Group ID 與 API Key');
                    return;
                }
                mmVoiceModal.style.display = 'flex';
                mmVoiceList.innerHTML = '<div style="text-align:center; color:#B78456; padding:20px;">⏳ 載入中...</div>';
                mmVoiceSearch.value = '';
                if (mmVoiceCount) mmVoiceCount.textContent = '';

                const baseUrl = provider === 'io' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';
                try {
                    const res = await fetch(`${baseUrl}/v1/get_voice`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ voice_type: 'system' })
                    });
                    const data = await res.json();
                    if (!res.ok || data.base_resp?.status_code !== 0) {
                        throw new Error(data.base_resp?.status_msg || res.statusText);
                    }
                    _fetchedVoices = data.system_voice || [];
                    if (mmVoiceCount) mmVoiceCount.textContent = `（共 ${_fetchedVoices.length} 個）`;
                    renderVoiceList(_fetchedVoices);
                } catch(err) {
                    mmVoiceList.innerHTML = `<div style="color:#fc8181; padding:10px;">❌ 載入失敗：${err.message}</div>`;
                }
            };

            mmVoiceSearch?.addEventListener('input', () => {
                const q = mmVoiceSearch.value.toLowerCase();
                const filtered = _fetchedVoices.filter(v => {
                    const desc = Array.isArray(v.description) ? v.description.join(' ') : (v.description || '');
                    return v.voice_id.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
                });
                renderVoiceList(filtered);
            });

            container.querySelector('#mm-voice-modal-close')?.addEventListener('click', () => {
                mmVoiceModal.style.display = 'none';
            });
            mmVoiceModal.addEventListener('click', (e) => {
                if (e.target === mmVoiceModal) mmVoiceModal.style.display = 'none';
            });
        }

        const mmTestBtn  = container.querySelector('#mm-test-btn');
        const mmStopBtn  = container.querySelector('#mm-stop-btn');
        const mmResult   = container.querySelector('#mm-test-result');
        if (mmTestBtn) {
            mmTestBtn.onclick = async () => {
                const voiceId = (container.querySelector('#mm-test-voice-id')?.value || '').trim();
                const text    = (container.querySelector('#mm-test-text')?.value || '').trim();
                const groupId = (container.querySelector('#mm-group-id')?.value || '').trim();
                const apiKey  = (container.querySelector('#mm-api-key')?.value || '').trim();
                const provider = container.querySelector('#mm-provider')?.value || 'cn';
                const model   = container.querySelector('#mm-speech-model')?.value || 'speech-01-turbo';

                if (!groupId || !apiKey) {
                    mmResult.style.display = 'block';
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ 請先填寫 Group ID 與 API Key';
                    return;
                }
                if (!voiceId) {
                    mmResult.style.display = 'block';
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ 請輸入語音 ID（如 male-01）';
                    return;
                }

                mmTestBtn.style.opacity = '0.5';
                mmTestBtn.textContent = '⏳ 合成中...';
                mmResult.style.display = 'block';
                mmResult.style.color = '#B78456';
                mmResult.textContent = '⏳ 正在呼叫 Minimax TTS API...';

                const win = window.parent || window;
                if (win.OS_MINIMAX) {
                    const existingCfg = win.OS_MINIMAX.getConfig ? win.OS_MINIMAX.getConfig() : {};
                    win.OS_MINIMAX.saveConfig({ ...existingCfg, groupId, apiKey, provider, speechModel: model });
                    const ok = await win.OS_MINIMAX.play(text, voiceId);
                    if (ok) {
                        mmResult.style.color = '#FBDFA2';
                        mmResult.textContent = '✅ 語音播放中...';
                        if (mmStopBtn) mmStopBtn.style.display = 'block';
                    } else {
                        mmResult.style.color = '#fc8181';
                        mmResult.textContent = '❌ 播放失敗，請檢查 Group ID / API Key / 語音 ID 是否正確';
                    }
                } else {
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ OS_MINIMAX 模組尚未載入，請確認 os_minimax.js 已加入載入列表';
                }
                mmTestBtn.style.opacity = '1';
                mmTestBtn.textContent = '🎵 播放測試語音';
            };
        }
        if (mmStopBtn) {
            mmStopBtn.onclick = () => {
                const win = window.parent || window;
                if (win.OS_MINIMAX) win.OS_MINIMAX.stop();
                mmStopBtn.style.display = 'none';
                if (mmResult) { mmResult.style.color = '#B78456'; mmResult.textContent = '已停止播放'; }
            };
        }

        btnImgTest.onclick = async () => {
            const testPrompt = elImgTestPrompt.value.trim();
            if (!testPrompt) return;
            btnImgTest.innerText = "⏳ 生成中...";
            btnImgTest.style.opacity = "0.5";
            status.innerText = "⏳ 正在生成圖片...";

            try {
                const win = window.parent || window;
                const imageManager = win.OS_IMAGE_MANAGER;
                if (!imageManager) throw new Error('ImageManager 未載入');

                imageManager.config.service = elImgService.value;
                
                imageManager.config.pollinations.apiKey = elPolApiKey.value.trim();
                imageManager.config.pollinations.model = elPolModel.value;
                imageManager.config.pollinations.charBasePrompt = elStylePrompt.value.trim();
                imageManager.config.pollinations.charNegPrompt = elCharNegPrompt.value.trim();
                imageManager.config.pollinations.petBasePrompt = elPetPrompt.value.trim();
                imageManager.config.pollinations.petNegPrompt = elPetNegPrompt.value.trim();

                const getNum = (selector, def) => parseFloat(container.querySelector(selector)?.value ?? def);
                const getInt = (selector, def) => parseInt(container.querySelector(selector)?.value ?? def);
                
                imageManager.config.novelai.token = elNaiToken.value.trim();
                if (elNaiModel) imageManager.config.novelai.model = elNaiModel.value;
                imageManager.config.novelai.sampler = container.querySelector('#img-nai-sampler')?.value || 'k_euler_ancestral';
                imageManager.config.novelai.scale = getNum('#img-nai-scale', 5);
                imageManager.config.novelai.steps = getInt('#img-nai-steps', 28);
                imageManager.config.novelai.ucPreset = getInt('#img-nai-uc-preset', 1);
                imageManager.config.novelai.qualityToggle = container.querySelector('#img-nai-quality-toggle')?.checked ?? true;
                imageManager.config.novelai.smea = container.querySelector('#img-nai-smea')?.checked ?? true;
                imageManager.config.novelai.smeaDyn = container.querySelector('#img-nai-smea-dyn')?.checked ?? false;
                imageManager.config.novelai.charBasePrompt = (container.querySelector('#img-nai-char-base')?.value || '').trim();
                imageManager.config.novelai.charNegPrompt = (container.querySelector('#img-nai-char-neg')?.value || '').trim();

                const [width, height] = elPolSize.value.split('x').map(Number);
                
                const imageUrl = await imageManager.generate(testPrompt, 'char', { width, height });

                imgTestImage.src = imageUrl;
                imgTestUrl.textContent = `URL: ${imageUrl}`;
                imgTestPreview.style.display = 'block';

                imgTestImage.onload = () => { status.innerText = "✅ 圖片加載成功"; };
                imgTestImage.onerror = () => { status.innerText = "❌ 圖片加載失敗 (請檢查 API Key / Token)"; };

            } catch(e) {
                console.error(e);
                status.innerText = `❌ 錯誤: ${e.message}`;
            } finally {
                btnImgTest.innerText = "🎨 生成預覽";
                btnImgTest.style.opacity = "1";
            }
        };

    }

    function bindBackupTab(container) {
        const win = window.parent || window;
        const BACKUP = win.OS_BACKUP;

        const elToken     = container.querySelector('#bk-token');
        const elGistId    = container.querySelector('#bk-gist-id');
        const elGistHint  = container.querySelector('#bk-gist-hint');
        const elStatus    = container.querySelector('#bk-status');

        function setStatus(msg, color) {
            if (elStatus) { elStatus.textContent = msg; elStatus.style.color = color || '#B78456'; }
        }
        function setBtnLoading(btn, text) { if (btn) { btn.textContent = text; btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; } }
        function setBtnDone(btn, text) { if (btn) { btn.textContent = text; btn.style.opacity = '1'; btn.style.pointerEvents = ''; } }

        if (BACKUP) {
            const s = BACKUP.getSettings();
            if (elToken && s.token) elToken.value = s.token;
            if (elGistId && s.gistId) elGistId.value = s.gistId;
            if (elGistHint && s.gistId) elGistHint.textContent = '目前 Gist ID: ' + s.gistId;
        }

        const btnGistSave = container.querySelector('#bk-gist-save-btn');
        if (btnGistSave) btnGistSave.addEventListener('click', async () => {
            if (!BACKUP) { setStatus('❌ OS_BACKUP 模組未載入', '#fc8181'); return; }
            const token = elToken?.value.trim();
            const gistId = elGistId?.value.trim() || null;
            if (!token) { setStatus('請先填入 GitHub Token', '#fc8181'); return; }
            BACKUP.saveSettings({ token, gistId });
            setBtnLoading(btnGistSave, '備份中...');
            setStatus('⏳ 正在備份到 GitHub Gist...', '#FBDFA2');
            try {
                const result = await BACKUP.gistBackup();
                if (elGistId) elGistId.value = result.gistId;
                if (elGistHint) elGistHint.textContent = '✅ 備份成功！Gist ID: ' + result.gistId + '（' + result.sizeKB + ' KB）';
                BACKUP.saveSettings({ token, gistId: result.gistId });
                setStatus('✅ 備份完成（' + result.sizeKB + ' KB）', '#FBDFA2');
            } catch(e) { setStatus('❌ 備份失敗：' + e.message, '#fc8181'); }
            setBtnDone(btnGistSave, '☁️ 備份到 Gist');
        });

        const btnGistRestore = container.querySelector('#bk-gist-restore-btn');
        if (btnGistRestore) btnGistRestore.addEventListener('click', async () => {
            if (!BACKUP) { setStatus('❌ OS_BACKUP 模組未載入', '#fc8181'); return; }
            const token = elToken?.value.trim();
            const gistId = elGistId?.value.trim() || null;
            if (!token || !gistId) { setStatus('請先填入 Token 與 Gist ID', '#fc8181'); return; }
            if (!confirm('從 Gist 還原將合併資料（不清空現有），確定繼續？')) return;
            BACKUP.saveSettings({ token, gistId });
            setBtnLoading(btnGistRestore, '還原中...');
            setStatus('⏳ 正在從 GitHub Gist 還原...', '#FBDFA2');
            try {
                const data = await BACKUP.gistRestore();
                const result = await BACKUP.applyData(data);
                setStatus(`✅ 還原完成：世界書 ${result.worldbook} 條、寵物 ${result.pets} 隻、設定 ${result.localStorage} 項`, '#FBDFA2');
            } catch(e) { setStatus('❌ 還原失敗：' + e.message, '#fc8181'); }
            setBtnDone(btnGistRestore, '⬇️ 從 Gist 還原');
        });

        const btnScan = container.querySelector('#bk-scan-btn');
        const elStorageInfo = container.querySelector('#bk-storage-info');
        if (btnScan) btnScan.addEventListener('click', async () => {
            if (!BACKUP) { if (elStorageInfo) elStorageInfo.textContent = 'OS_BACKUP 未載入'; return; }
            btnScan.textContent = '掃描中...';
            try {
                const info = await BACKUP.estimateSize();
                const lines = Object.entries(info).map(([k, v]) =>
                    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(251,223,162,0.2);">
                        <span style="color:#E0D8C8">${k}</span>
                        <span style="color:#FBDFA2; font-weight:bold;">${v.count} 筆 / ${v.kb} KB</span>
                    </div>`
                ).join('');
                if (elStorageInfo) elStorageInfo.innerHTML = lines || '（無資料）';
            } catch(e) { if (elStorageInfo) elStorageInfo.textContent = '掃描失敗: ' + e.message; }
            btnScan.textContent = '掃描';
        });

        const btnExport = container.querySelector('#bk-export-btn');
        if (btnExport) btnExport.addEventListener('click', async () => {
            if (!BACKUP) { setStatus('❌ OS_BACKUP 模組未載入', '#fc8181'); return; }
            setBtnLoading(btnExport, '準備中...');
            setStatus('⏳ 正在打包資料...', '#FBDFA2');
            try {
                const sizeKB = await BACKUP.exportLocal();
                setStatus('✅ 匯出完成（' + sizeKB + ' KB），請儲存至安全位置', '#FBDFA2');
            } catch(e) { setStatus('❌ 匯出失敗：' + e.message, '#fc8181'); }
            setBtnDone(btnExport, '📤 匯出完整備份 JSON');
        });

        const btnImport = container.querySelector('#bk-import-btn');
        const fileInput = container.querySelector('#bk-file-input');
        if (btnImport) btnImport.addEventListener('click', () => fileInput?.click());
        if (fileInput) fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file || !BACKUP) return;
            if (!confirm('從本地 JSON 還原將合併資料，確定繼續？')) return;
            setStatus('⏳ 正在匯入...', '#FBDFA2');
            try {
                const result = await BACKUP.importLocal(file);
                setStatus(`✅ 匯入完成：世界書 ${result.worldbook} 條、寵物 ${result.pets} 隻、設定 ${result.localStorage} 項`, '#FBDFA2');
            } catch(e) { setStatus('❌ 匯入失敗：' + e.message, '#fc8181'); }
            e.target.value = '';
        });

        // 🔥 新增：一鍵格式化邏輯
        const btnFormat = container.querySelector('#bk-format-btn');
        if (btnFormat) {
            btnFormat.addEventListener('click', async () => {
                const firstConfirm = confirm('⚠️ 警告：即將清空所有系統數據！這將徹底刪除你的所有劇情、對話、變數和設定！\n\n確定要繼續嗎？');
                if (!firstConfirm) return;
                
                const secondConfirm = confirm('🛑 最終防線：資料刪除後無法恢復（宛如物理超渡）。\n請確保你已經匯出了備份檔。\n\n真的要徹底格式化嗎？');
                if (!secondConfirm) return;

                setBtnLoading(btnFormat, '格式化中...');
                setStatus('💥 正在執行全系統格式化，請勿關閉網頁...', '#fc8181');
                
                try {
                    // 清除 LocalStorage
                    localStorage.clear();
                    
                    // 呼叫 OS_DB 的核彈接口
                    const win = window.parent || window;
                    if (win.OS_DB && typeof win.OS_DB.factoryReset === 'function') {
                        await win.OS_DB.factoryReset();
                    } else {
                        console.warn('[PhoneOS] 找不到 OS_DB.factoryReset，僅執行 localStorage 清理');
                    }
                    
                    setStatus('✅ 格式化完成！系統即將重生...', '#b8ffcb');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch (e) {
                    setStatus('❌ 格式化失敗：' + e.message, '#fc8181');
                    setBtnDone(btnFormat, '💥 格式化並清空所有數據');
                }
            });
        }
    }

    window.OS_SETTINGS.launchApp = launchApp;

    function install() {
        const win = window.parent || window;
        if (win.PhoneSystem) { win.PhoneSystem.install('設置', '⚙️', '#4c4c4c', launchApp); }
        else { setTimeout(install, 500); }
    }
    install();
})();