// ----------------------------------------------------------------
// [檔案 12] wx_bubble_settings.js (V3.0 - Per Chat ID)
// 功能：支援「每個聊天室獨立」的氣泡樣式設置。
// ----------------------------------------------------------------
(function() {
    console.log('[WeChat] 載入氣泡樣式模塊 V3.0 (ID Specific)...');
    const win = window.parent || window;
    const doc = win.document;
    
    const STYLE_ID = 'wx-bubble-custom-style';

    // 預設樣式 (若該角色未設定，使用此樣式)
    const DEFAULT_CONFIG = {
        mode: 'general',
        me_bgColor: '#95ec69', me_textColor: '#000000',
        me_radiusTL: 6, me_radiusTR: 6, me_radiusBR: 6, me_radiusBL: 6,
        me_borderEnabled: false, me_borderWidth: 1, me_borderColor: '#000000',
        
        other_bgColor: '#ffffff', other_textColor: '#000000',
        other_radiusTL: 6, other_radiusTR: 6, other_radiusBR: 6, other_radiusBL: 6,
        other_borderEnabled: false, other_borderWidth: 1, other_borderColor: '#dddddd',
        
        customCSS: `/* 尚未設定 */`
    };

    let currentEditTarget = 'me';

    win.WX_BUBBLE_SETTINGS = {
        init: function() {
            // 初始化時不動作，等待 openChat 呼叫 applyStyle
        },

        // 取得特定 ID 的設定，如果沒有則回傳預設值
        getConfig: function(chatId) {
            if (!chatId) return DEFAULT_CONFIG;
            const key = `wx_bubble_style_${chatId}`;
            const saved = localStorage.getItem(key);
            return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
        },

        // 儲存特定 ID 的設定
        saveConfig: function(chatId, config) {
            if (!chatId) return;
            const key = `wx_bubble_style_${chatId}`;
            localStorage.setItem(key, JSON.stringify(config));
            this.applyStyle(chatId); // 立即套用
        },

        // [核心] 根據當前 chatId 產生 CSS 並注入
        applyStyle: function(chatId) {
            const config = this.getConfig(chatId);
            let css = '';

            if (config.mode === 'general') {
                // --- Me ---
                const meBorder = config.me_borderEnabled ? 
                    `border: ${config.me_borderWidth}px solid ${config.me_borderColor} !important;` : 
                    `border: 1px solid #86d45a;`;
                css += `
                    .wx-msg-row.me .wx-bubble-content {
                        background: ${config.me_bgColor} !important;
                        color: ${config.me_textColor} !important;
                        border-radius: ${config.me_radiusTL}px ${config.me_radiusTR}px ${config.me_radiusBR}px ${config.me_radiusBL}px !important;
                        ${meBorder}
                    }
                    .wx-msg-row.me .wx-bubble-content::before {
                        border-left-color: ${config.me_bgColor} !important;
                        ${config.me_borderEnabled ? 'display: none;' : ''}
                    }
                `;

                // --- Other ---
                const otherBorder = config.other_borderEnabled ? 
                    `border: ${config.other_borderWidth}px solid ${config.other_borderColor} !important;` : 
                    `border: 1px solid #ededed;`;
                css += `
                    .wx-msg-row.you .wx-bubble-content {
                        background: ${config.other_bgColor} !important;
                        color: ${config.other_textColor} !important;
                        border-radius: ${config.other_radiusTL}px ${config.other_radiusTR}px ${config.other_radiusBR}px ${config.other_radiusBL}px !important;
                        ${otherBorder}
                    }
                    .wx-msg-row.you .wx-bubble-content::before {
                        border-right-color: ${config.other_bgColor} !important;
                        ${config.other_borderEnabled ? 'display: none;' : ''}
                    }
                `;
            } else {
                css = config.customCSS;
            }

            let styleTag = doc.getElementById(STYLE_ID);
            if (!styleTag) {
                styleTag = doc.createElement('style');
                styleTag.id = STYLE_ID;
                doc.head.appendChild(styleTag);
            }
            styleTag.innerHTML = css;
        },

        open: function(chatId) {
            if (!chatId) { alert("無法識別聊天室 ID"); return; }
            const config = this.getConfig(chatId);
            currentEditTarget = 'me';

            const html = `
                <div class="wx-modal-title">氣泡設置 (${chatId})</div>
                <div style="font-size:11px; text-align:center; color:#999; margin-bottom:10px;">此設定僅對本聊天室生效</div>

                <div style="display:flex; border-bottom:1px solid #eee; margin-bottom:10px;">
                    <div id="tab-general" class="wx-tab-btn ${config.mode === 'general' ? 'active' : ''}" style="flex:1; text-align:center; padding:10px; cursor:pointer; font-weight:bold; color:${config.mode==='general'?'#07c160':'#999'}; border-bottom:2px solid ${config.mode==='general'?'#07c160':'transparent'};">一般設置</div>
                    <div id="tab-custom" class="wx-tab-btn ${config.mode === 'custom' ? 'active' : ''}" style="flex:1; text-align:center; padding:10px; cursor:pointer; font-weight:bold; color:${config.mode==='custom'?'#07c160':'#999'}; border-bottom:2px solid ${config.mode==='custom'?'#07c160':'transparent'};">CSS 代碼</div>
                </div>

                <div style="background:#f5f5f5; padding:15px; border-radius:8px; margin-bottom:10px; display:flex; flex-direction:column; gap:10px; height:80px; justify-content:center;">
                    <div style="display:flex; align-items:flex-start;">
                        <div style="width:30px; height:30px; background:#ddd; border-radius:4px; margin-right:5px;"></div>
                        <div id="preview-other" style="padding:8px 12px; font-size:14px; position:relative; max-width:70%;">Hi!</div>
                    </div>
                    <div style="display:flex; align-items:flex-start; justify-content:flex-end;">
                        <div id="preview-me" style="padding:8px 12px; font-size:14px; position:relative; max-width:70%;">Hello~</div>
                        <div style="width:30px; height:30px; background:#a5e6aa; border-radius:4px; margin-left:5px;"></div>
                    </div>
                </div>

                <div id="panel-general" style="display:${config.mode === 'general' ? 'block' : 'none'};">
                    <div style="display:flex; gap:10px; margin-bottom:10px; justify-content:center;">
                        <button id="btn-target-other" class="wx-btn" style="background:#f0f0f0; color:#333; border:1px solid #ddd; padding:5px 15px;">⚪ 編輯對方</button>
                        <button id="btn-target-me" class="wx-btn" style="background:#07c160; color:#fff; border:1px solid #07c160; padding:5px 15px;">🟢 編輯我</button>
                    </div>

                    <div class="wx-set-group" style="margin:0; border:none;">
                        <div class="wx-set-item">
                            <span class="wx-set-label">背景顏色</span>
                            <input type="color" id="inp-bgcolor" style="border:none; background:transparent; cursor:pointer;">
                        </div>
                        <div class="wx-set-item">
                            <span class="wx-set-label">文字顏色</span>
                            <input type="color" id="inp-textcolor" style="border:none; background:transparent; cursor:pointer;">
                        </div>
                        <div class="wx-set-item" style="flex-direction:column; align-items:flex-start; gap:5px;">
                            <span class="wx-set-label">圓角 (左上/右上/右下/左下)</span>
                            <div style="display:flex; gap:5px; width:100%;">
                                <input type="number" id="inp-r1" class="wx-modal-input" style="padding:5px; text-align:center;">
                                <input type="number" id="inp-r2" class="wx-modal-input" style="padding:5px; text-align:center;">
                                <input type="number" id="inp-r3" class="wx-modal-input" style="padding:5px; text-align:center;">
                                <input type="number" id="inp-r4" class="wx-modal-input" style="padding:5px; text-align:center;">
                            </div>
                        </div>
                        <div class="wx-set-item">
                            <span class="wx-set-label">啟用邊框</span>
                            <input type="checkbox" id="inp-border-en">
                        </div>
                        <div class="wx-set-item" id="border-settings" style="display:none; gap:10px;">
                             <input type="number" id="inp-border-w" class="wx-modal-input" placeholder="寬度" style="width:60px;">
                             <input type="color" id="inp-border-c" style="border:none; background:transparent;">
                        </div>
                    </div>
                </div>

                <div id="panel-custom" style="display:${config.mode === 'custom' ? 'block' : 'none'};">
                    <textarea id="inp-css" class="wx-modal-input" style="height:150px; font-family:monospace; font-size:11px; white-space:pre;">${config.customCSS}</textarea>
                </div>

                <div class="wx-modal-footer">
                    <button class="wx-btn wx-btn-cancel" id="wx-bubble-close">關閉</button>
                    <button class="wx-btn wx-btn-confirm" id="wx-bubble-save">保存</button>
                </div>
            `;

            this.showModal(html);
            this.bindEvents(chatId, config);
        },

        bindEvents: function(chatId, currentConfig) {
            let tempConfig = { ...currentConfig };
            const previewMe = doc.getElementById('preview-me');
            const previewOther = doc.getElementById('preview-other');

            const updatePreview = () => {
                // Me
                previewMe.style.background = tempConfig.me_bgColor;
                previewMe.style.color = tempConfig.me_textColor;
                previewMe.style.borderRadius = `${tempConfig.me_radiusTL}px ${tempConfig.me_radiusTR}px ${tempConfig.me_radiusBR}px ${tempConfig.me_radiusBL}px`;
                previewMe.style.border = tempConfig.me_borderEnabled ? `${tempConfig.me_borderWidth}px solid ${tempConfig.me_borderColor}` : 'none';
                // Other
                previewOther.style.background = tempConfig.other_bgColor;
                previewOther.style.color = tempConfig.other_textColor;
                previewOther.style.borderRadius = `${tempConfig.other_radiusTL}px ${tempConfig.other_radiusTR}px ${tempConfig.other_radiusBR}px ${tempConfig.other_radiusBL}px`;
                previewOther.style.border = tempConfig.other_borderEnabled ? `${tempConfig.other_borderWidth}px solid ${tempConfig.other_borderColor}` : 'none';
            };

            const loadValuesToInputs = () => {
                const prefix = currentEditTarget + '_';
                doc.getElementById('inp-bgcolor').value = tempConfig[prefix + 'bgColor'];
                doc.getElementById('inp-textcolor').value = tempConfig[prefix + 'textColor'];
                doc.getElementById('inp-r1').value = tempConfig[prefix + 'radiusTL'];
                doc.getElementById('inp-r2').value = tempConfig[prefix + 'radiusTR'];
                doc.getElementById('inp-r3').value = tempConfig[prefix + 'radiusBR'];
                doc.getElementById('inp-r4').value = tempConfig[prefix + 'radiusBL'];
                doc.getElementById('inp-border-en').checked = tempConfig[prefix + 'borderEnabled'];
                doc.getElementById('inp-border-w').value = tempConfig[prefix + 'borderWidth'];
                doc.getElementById('inp-border-c').value = tempConfig[prefix + 'borderColor'];
                doc.getElementById('border-settings').style.display = tempConfig[prefix + 'borderEnabled'] ? 'flex' : 'none';
                
                const btnMe = doc.getElementById('btn-target-me');
                const btnOther = doc.getElementById('btn-target-other');
                if (currentEditTarget === 'me') {
                    btnMe.style.background = '#07c160'; btnMe.style.color = '#fff'; btnMe.style.borderColor = '#07c160';
                    btnOther.style.background = '#f0f0f0'; btnOther.style.color = '#333'; btnOther.style.borderColor = '#ddd';
                } else {
                    btnOther.style.background = '#07c160'; btnOther.style.color = '#fff'; btnOther.style.borderColor = '#07c160';
                    btnMe.style.background = '#f0f0f0'; btnMe.style.color = '#333'; btnMe.style.borderColor = '#ddd';
                }
            };

            const bindInput = (id, keySuffix, isNum = false) => {
                const el = doc.getElementById(id);
                if(!el) return;
                el.oninput = () => {
                    const fullKey = currentEditTarget + '_' + keySuffix;
                    tempConfig[fullKey] = isNum ? (parseInt(el.value) || 0) : el.value;
                    updatePreview();
                };
            };
            bindInput('inp-bgcolor', 'bgColor'); bindInput('inp-textcolor', 'textColor');
            bindInput('inp-r1', 'radiusTL', true); bindInput('inp-r2', 'radiusTR', true);
            bindInput('inp-r3', 'radiusBR', true); bindInput('inp-r4', 'radiusBL', true);
            bindInput('inp-border-w', 'borderWidth', true); bindInput('inp-border-c', 'borderColor');

            const checkBorder = doc.getElementById('inp-border-en');
            checkBorder.onchange = () => {
                tempConfig[currentEditTarget + '_borderEnabled'] = checkBorder.checked;
                doc.getElementById('border-settings').style.display = checkBorder.checked ? 'flex' : 'none';
                updatePreview();
            };

            doc.getElementById('btn-target-me').onclick = () => { currentEditTarget = 'me'; loadValuesToInputs(); };
            doc.getElementById('btn-target-other').onclick = () => { currentEditTarget = 'other'; loadValuesToInputs(); };

            const switchTab = (mode) => {
                tempConfig.mode = mode;
                doc.getElementById('panel-general').style.display = mode === 'general' ? 'block' : 'none';
                doc.getElementById('panel-custom').style.display = mode === 'custom' ? 'block' : 'none';
                const tabs = doc.querySelectorAll('.wx-tab-btn');
                tabs.forEach(t => { t.style.color = '#999'; t.style.borderBottomColor = 'transparent'; });
                const activeTab = doc.getElementById(`tab-${mode}`);
                activeTab.style.color = '#07c160'; activeTab.style.borderBottomColor = '#07c160';
            };
            doc.getElementById('tab-general').onclick = () => switchTab('general');
            doc.getElementById('tab-custom').onclick = () => switchTab('custom');

            doc.getElementById('inp-css').oninput = (e) => { tempConfig.customCSS = e.target.value; };
            doc.getElementById('wx-bubble-close').onclick = () => { doc.getElementById('wxActionModal').classList.remove('show'); };
            doc.getElementById('wx-bubble-save').onclick = () => { 
                this.saveConfig(chatId, tempConfig); 
                doc.getElementById('wxActionModal').classList.remove('show'); 
            };
            
            loadValuesToInputs();
            updatePreview();
        },

        showModal: function(innerHtml) {
            const modal = doc.getElementById('wxActionModal');
            const box = modal.querySelector('.wx-modal-box');
            let customContainer = doc.getElementById('wx-custom-modal-content');
            if (!customContainer) {
                customContainer = doc.createElement('div');
                customContainer.id = 'wx-custom-modal-content';
                box.appendChild(customContainer);
            }
            ['wxModalTitle', 'wxModalInput', 'wxModalInput2'].forEach(id => { const el = doc.getElementById(id); if(el) el.style.display = 'none'; });
            const footer = modal.querySelector('.wx-modal-footer'); if(footer) footer.style.display = 'none';
            customContainer.innerHTML = innerHtml; customContainer.style.display = 'block'; modal.classList.add('show');
            const observer = new MutationObserver((mutations) => {
                if (!modal.classList.contains('show')) {
                    customContainer.innerHTML = '';
                    ['wxModalTitle', 'wxModalInput'].forEach(id => { const el = doc.getElementById(id); if(el) el.style.display = 'block'; });
                    if(footer) footer.style.display = 'flex';
                }
            });
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    };
})();