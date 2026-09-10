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
        
        customCSS: `/* 尚未設定 */`,
        // 🤖 AI 主題跟手寫 CSS 分開存：她 AI 生一版不滿意想切回自己那份時，
        //    兩邊都還在（共用一格的話，切過去就把手寫那份洗掉了）
        aiCSS: ''
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
            this.injectConfig(this.getConfig(chatId));
        },

        // VN 劇情裡演出來的手機聊天：那邊的聊天室只有房名（或 AI 自己寫的 id），
        // 跟微信的聯絡人 id 不是同一個空間。用房名去聯絡人裡找同名的人，
        // 找到就吃他在微信那邊設好的泡泡——同一個人，兩邊長一樣。
        // 找不到（群聊、路人、還沒建聯絡人）就回預設外觀，不要留著上一間的皮。
        applyStyleForRoom: function(roomName) {
            let id = '';
            try {
                const C = win.WX_CONTACTS;
                const list = (C && C.getAllCustomContacts) ? C.getAllCustomContacts() : [];
                const hit = (list || []).find(c => c && c.name === roomName);
                id = (hit && hit.id) || '';
            } catch (e) {}
            if (id) this.applyStyle(id); else this.injectConfig(DEFAULT_CONFIG);
            return id;
        },

        // 用一份 config 直接產 CSS 注入（不經 localStorage）。
        // 設置面板拿它做「還沒按保存就看得到」的即時預覽；預覽用的是真實結構與真實選擇器，
        // 所以這裡看到什麼，套用之後就是什麼。
        injectConfig: function(config) {
            config = config || DEFAULT_CONFIG;
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
            } else if (config.mode === 'ai') {
                // 🤖 AI 主題：底稿先鋪（統一兩個 app 的尖角與變數），AI 的 CSS 接在後面覆蓋。
                //    底稿只在這個模式注入——微調與手寫 CSS 那兩條路完全不受影響。
                // 🚨存的是 AI 的原文，注入前才提權（boost）——兩個 app 的預設泡泡
                //   特異性比 AI 寫的高，不提權會變成「字色變了、底色沒變」。
                const AI = win.WX_BUBBLE_AI || window.WX_BUBBLE_AI;
                css = (AI ? AI.BASE_CSS : '') + '\n' + (AI && AI.boost ? AI.boost(config.aiCSS || '') : (config.aiCSS || ''));
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
            this._curChatId = chatId;      // 關閉時要拿它把即時預覽還原回已存的設定
            const config = this.getConfig(chatId);
            currentEditTarget = 'me';

            const html = `
                <div class="wx-modal-title">氣泡設置 (${chatId})</div>
                <div style="font-size:11px; text-align:center; color:#999; margin-bottom:10px;">此設定僅對本聊天室生效</div>

                <div style="display:flex; border-bottom:1px solid #eee; margin-bottom:10px;">
                    <div id="tab-general" class="wx-tab-btn ${config.mode === 'general' ? 'active' : ''}" style="flex:1; text-align:center; padding:10px 4px; cursor:pointer; font-weight:bold; font-size:13px; color:${config.mode==='general'?'#07c160':'#999'}; border-bottom:2px solid ${config.mode==='general'?'#07c160':'transparent'};">微調</div>
                    <div id="tab-ai" class="wx-tab-btn ${config.mode === 'ai' ? 'active' : ''}" style="flex:1; text-align:center; padding:10px 4px; cursor:pointer; font-weight:bold; font-size:13px; color:${config.mode==='ai'?'#07c160':'#999'}; border-bottom:2px solid ${config.mode==='ai'?'#07c160':'transparent'};">交給 AI</div>
                    <div id="tab-custom" class="wx-tab-btn ${config.mode === 'custom' ? 'active' : ''}" style="flex:1; text-align:center; padding:10px 4px; cursor:pointer; font-weight:bold; font-size:13px; color:${config.mode==='custom'?'#07c160':'#999'}; border-bottom:2px solid ${config.mode==='custom'?'#07c160':'transparent'};">CSS</div>
                    <!-- 🚨主題庫是「瀏覽」不是一種樣式模式：切到它不會改變現在生效的是哪一套 -->
                    <div id="tab-gal" class="wx-tab-btn" style="flex:1; text-align:center; padding:10px 4px; cursor:pointer; font-weight:bold; font-size:13px; color:#999; border-bottom:2px solid transparent;">主題庫</div>
                </div>

                <!-- 預覽照真實聊天畫面的結構做（同一組 class），主題怎麼套在這裡就怎麼套在真畫面上。
                     底色用淺格紋：聊天背景是她自己挑的圖，深淺未知，格紋比純白更容易看出泡泡有沒有底。 -->
                <div class="wx-bubble-preview-stage" style="background:#eaeaea; background-image:linear-gradient(45deg,rgba(0,0,0,0.04) 25%,transparent 25%,transparent 75%,rgba(0,0,0,0.04) 75%),linear-gradient(45deg,rgba(0,0,0,0.04) 25%,transparent 25%,transparent 75%,rgba(0,0,0,0.04) 75%); background-size:16px 16px; background-position:0 0,8px 8px; padding:14px 6px; border-radius:8px; margin-bottom:10px; overflow:hidden;">
                    <div class="wx-msg-row you pbub-row pbub-other" style="margin:0 12px 12px;">
                        <div class="wx-bubble-avatar pbub-avatar" style="background:#ccc;"></div>
                        <div style="max-width:70%;"><div class="wx-bubble-content pbub-bubble" id="preview-other">今晚要不要出來？</div></div>
                    </div>
                    <div class="wx-msg-row me pbub-row pbub-me" style="margin:0 12px;">
                        <div class="wx-bubble-avatar pbub-avatar" style="background:#a5e6aa;"></div>
                        <div style="max-width:70%;"><div class="wx-bubble-content pbub-bubble" id="preview-me">好啊，老地方。</div></div>
                    </div>
                </div>

                <div id="panel-general" style="display:${config.mode === 'general' ? 'block' : 'none'};">
                    <div style="display:flex; gap:10px; margin-bottom:10px; justify-content:center;">
                        <button id="btn-target-other" class="wx-btn" style="background:#f0f0f0; color:#333; border:1px solid #ddd; padding:5px 15px;"><i class="fa-solid fa-circle"></i> 編輯對方</button>
                        <button id="btn-target-me" class="wx-btn" style="background:#07c160; color:#fff; border:1px solid #07c160; padding:5px 15px;"><i class="fa-solid fa-circle"></i> 編輯我</button>
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

                <!-- 🤖 交給 AI：跟他說一句要什麼風格，他出一整套；不滿意再說一句就改。
                     生成完直接套用（不用先按保存），改壞了按還原。 -->
                <div id="panel-ai" style="display:${config.mode === 'ai' ? 'block' : 'none'};">
                    <div id="ai-log" style="max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; margin-bottom:8px; padding:2px;"></div>
                    <textarea id="ai-say" class="wx-modal-input" style="height:56px; font-size:13px; resize:none;" placeholder="想要什麼風格？例：深夜霓虹的賽博終端、牛皮紙寫的手寫信"></textarea>
                    <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
                        <button id="ai-send" class="wx-btn" style="flex:1; background:#07c160; color:#fff; border:none; padding:8px;">送出</button>
                        <button id="ai-undo" class="wx-btn" style="background:#f0f0f0; color:#666; border:1px solid #ddd; padding:8px 10px; display:none;"><i class="fa-solid fa-clock-rotate-left"></i> 還原</button>
                        <button id="ai-clear" class="wx-btn" style="background:#f0f0f0; color:#999; border:1px solid #ddd; padding:8px 10px;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>

                <div id="panel-custom" style="display:${config.mode === 'custom' ? 'block' : 'none'};">
                    <textarea id="inp-css" class="wx-modal-input" style="height:150px; font-family:monospace; font-size:11px; white-space:pre;">${config.customCSS}</textarea>
                </div>

                <!-- 📚 主題庫：全域，收藏一次之後任何人的聊天室都能套。
                     縮圖是 iframe，內容＝預覽骨架＋底稿＋提權後的主題，看到什麼套上去就是什麼。 -->
                <div id="panel-gal" style="display:none;">
                    <div style="display:flex; gap:6px; margin-bottom:10px;">
                        <input id="gal-name" class="wx-modal-input" style="flex:1; padding:8px; font-size:13px;" placeholder="幫這一套取個名字">
                        <button id="gal-add" class="wx-btn" style="background:#07c160; color:#fff; border:none; padding:8px 12px; white-space:nowrap;"><i class="fa-solid fa-bookmark"></i> 收藏目前</button>
                    </div>
                    <div id="gal-list" style="max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;"></div>
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
                // 三個分頁都即時預覽：把編輯中的 config 直接注入，預覽用的是真實結構與真實選擇器。
                this.injectConfig(tempConfig);
                if (tempConfig.mode !== 'general') {
                    // 🚨inline style 壓得過任何選擇器。微調那頁靠它即時反應，
                    //   但 AI 主題與手寫 CSS 是靠選擇器命中的，留著 inline 就永遠看不到效果。
                    previewMe.style.cssText = '';
                    previewOther.style.cssText = '';
                    return;
                }
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

            const switchTab = (tab) => {
                // 🚨主題庫是瀏覽用的分頁，不是一種樣式模式——切過去不能改掉現在生效的那一套，
                //   不然她只是想翻翻庫，回來就發現套用的東西被換掉了。
                if (tab !== 'gal') tempConfig.mode = tab;
                doc.getElementById('panel-general').style.display = tab === 'general' ? 'block' : 'none';
                doc.getElementById('panel-ai').style.display = tab === 'ai' ? 'block' : 'none';
                doc.getElementById('panel-custom').style.display = tab === 'custom' ? 'block' : 'none';
                doc.getElementById('panel-gal').style.display = tab === 'gal' ? 'block' : 'none';
                const tabs = doc.querySelectorAll('.wx-tab-btn');
                tabs.forEach(t => { t.style.color = '#999'; t.style.borderBottomColor = 'transparent'; });
                const activeTab = doc.getElementById(`tab-${tab}`);
                activeTab.style.color = '#07c160'; activeTab.style.borderBottomColor = '#07c160';
                updatePreview();
            };
            doc.getElementById('tab-general').onclick = () => switchTab('general');
            doc.getElementById('tab-ai').onclick = () => switchTab('ai');
            doc.getElementById('tab-custom').onclick = () => switchTab('custom');
            doc.getElementById('tab-gal').onclick = () => switchTab('gal');

            this.bindAI(chatId, tempConfig, updatePreview);
            this.bindGallery(chatId, tempConfig, updatePreview, switchTab);

            doc.getElementById('inp-css').oninput = (e) => { tempConfig.customCSS = e.target.value; };
            doc.getElementById('wx-bubble-close').onclick = () => { doc.getElementById('wxActionModal').classList.remove('show'); };
            doc.getElementById('wx-bubble-save').onclick = () => { 
                this.saveConfig(chatId, tempConfig); 
                doc.getElementById('wxActionModal').classList.remove('show'); 
            };
            
            loadValuesToInputs();
            updatePreview();
        },

        // 🤖 交給 AI 那一頁：對話式。說一句 → 出一整套 → 直接套用 → 不滿意再說一句。
        //    生成完就套用（不用先按保存），因為她要的是「講完馬上看到」；改壞了按還原。
        bindAI: function(chatId, tempConfig, updatePreview) {
            const AI = win.WX_BUBBLE_AI || window.WX_BUBBLE_AI;
            const logBox = doc.getElementById('ai-log');
            const sayEl = doc.getElementById('ai-say');
            const sendBtn = doc.getElementById('ai-send');
            const undoBtn = doc.getElementById('ai-undo');
            const clearBtn = doc.getElementById('ai-clear');
            if (!logBox || !sayEl || !sendBtn) return;
            if (!AI) { logBox.innerHTML = '<div style="font-size:12px;color:#fa5151;">泡泡主題 AI 模組沒載入到，重整一次看看</div>'; return; }

            const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            let log = AI.chatLoad(chatId);
            let undo = AI.undoLoad(chatId);
            let sending = false;

            const syncUndo = () => { undoBtn.style.display = undo.length ? 'block' : 'none'; };
            const bubble = (role, text) => {
                const b = doc.createElement('div');
                const mine = role === 'user';
                b.style.cssText = 'font-size:12px; line-height:1.5; padding:6px 9px; border-radius:8px; max-width:85%; white-space:pre-wrap; word-break:break-word;'
                    + (mine ? 'align-self:flex-end; background:#95ec69; color:#000;' : 'align-self:flex-start; background:#fff; color:#333; border:1px solid #eee;');
                b.innerHTML = esc(text).replace(/\n/g, '<br>');
                logBox.appendChild(b);
                logBox.scrollTop = logBox.scrollHeight;
                return b;
            };
            const render = () => {
                logBox.innerHTML = '';
                if (!log.length) {
                    logBox.innerHTML = '<div style="font-size:12px; color:#999; line-height:1.6;">'
                        + '跟他說你要什麼風格，他會把兩邊的泡泡跟頭像框一起做成一套。'
                        + '做好直接套上去，想改哪裡再說一句就好（例：對方那邊的字太小、尖角拿掉）。</div>';
                    return;
                }
                log.forEach(m => bubble(m.role, m.text));
            };
            render(); syncUndo();

            const applyCss = (css) => {
                undo.push(tempConfig.aiCSS || '');
                AI.undoSave(chatId, undo); syncUndo();
                tempConfig.aiCSS = css;
                tempConfig.mode = 'ai';
                this.saveConfig(chatId, tempConfig);   // 邊講邊套：存下去並立刻生效
                updatePreview();
            };

            const send = () => {
                const text = (sayEl.value || '').trim();
                if (!text || sending) return;
                sayEl.value = '';
                if (!log.length) logBox.innerHTML = '';
                log.push({ role: 'user', text }); AI.chatSave(chatId, log);
                bubble('user', text);

                sending = true; sendBtn.disabled = true; sendBtn.textContent = '設計中…';
                const wait = bubble('ai', '在想了…');

                AI.ask({
                    chatId, text, currentCss: tempConfig.aiCSS || '', log,
                    onDone: (res) => {
                        sending = false; sendBtn.disabled = false; sendBtn.textContent = '送出';
                        wait.remove();
                        if (!res.css) {
                            // 他只回話沒給 CSS（在問你問題，或這次不需要改）——原樣顯示
                            const t = res.note || '（這次沒有給新的樣式）';
                            log.push({ role: 'ai', text: t }); AI.chatSave(chatId, log); bubble('ai', t);
                            return;
                        }
                        applyCss(res.css);
                        let msg = res.note ? res.note.slice(0, 200) : '好了，套上去了。';
                        if (res.cut) msg += '\n⚠️這一版可能被截斷了，看起來怪的話叫他重出一次。';
                        if (res.stripped) msg += '\n（有幾條會把左右分邊弄壞的寫法，已經拿掉了）';
                        if (res.warns && res.warns.length) msg += '\n⚠️' + res.warns.join('；');
                        log.push({ role: 'ai', text: msg }); AI.chatSave(chatId, log); bubble('ai', msg);
                    },
                    onError: (err) => {
                        sending = false; sendBtn.disabled = false; sendBtn.textContent = '送出';
                        wait.remove();
                        bubble('ai', '沒接上：' + ((err && err.message) || err || '未知錯誤'));
                    }
                });
            };
            sendBtn.onclick = send;
            sayEl.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };

            undoBtn.onclick = () => {
                if (!undo.length) return;
                const prev = undo.pop();
                AI.undoSave(chatId, undo); syncUndo();
                tempConfig.aiCSS = prev;
                this.saveConfig(chatId, tempConfig);
                updatePreview();
                bubble('ai', '退回上一版了。');
            };

            // 🚨window.confirm 在 Tauri 會被攔掉（按了完全沒反應），一律兩段式
            let armed = false, armTimer = 0;
            clearBtn.onclick = () => {
                if (!armed) {
                    armed = true;
                    clearBtn.innerHTML = '再按一次';
                    armTimer = setTimeout(() => { armed = false; clearBtn.innerHTML = '<i class="fa-solid fa-trash"></i>'; }, 4000);
                    return;
                }
                armed = false; clearTimeout(armTimer);
                clearBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                log = []; AI.chatClear(chatId); render();
            };
        },

        // 📚 主題庫：全域的，收藏一次之後任何人的聊天室都能一鍵套上去。
        //    三個分頁調出來的都收得進來——微調那頁的參數會先轉成主題 CSS。
        bindGallery: function(chatId, tempConfig, updatePreview, switchTab) {
            const AI = win.WX_BUBBLE_AI || window.WX_BUBBLE_AI;
            const listEl = doc.getElementById('gal-list');
            const nameEl = doc.getElementById('gal-name');
            const addBtn = doc.getElementById('gal-add');
            if (!listEl || !addBtn) return;
            if (!AI) { listEl.innerHTML = '<div style="font-size:12px;color:#fa5151;">泡泡主題模組沒載入到，重整一次看看</div>'; return; }

            const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const hint = (msg, color) => { nameEl.placeholder = msg; nameEl.style.borderColor = color || '#fa5151'; setTimeout(() => { nameEl.placeholder = '幫這一套取個名字'; nameEl.style.borderColor = ''; }, 2600); };
            const flash = (btn, txt) => { const o = btn.innerHTML; btn.innerHTML = txt; setTimeout(() => { btn.innerHTML = o; }, 1100); };

            // 現在生效的是哪一段 CSS。微調那頁存的是一堆參數不是 CSS，先轉過來——
            // 不轉的話她在微調頁試出來的配色就收不進庫，而那本來就是她最常用的入口。
            const currentCss = () => {
                if (tempConfig.mode === 'ai') return tempConfig.aiCSS || '';
                if (tempConfig.mode === 'custom') return tempConfig.customCSS || '';
                return AI.fromGeneral(tempConfig);
            };

            const render = () => {
                const arr = AI.galLoad();
                if (!arr.length) {
                    listEl.innerHTML = '<div style="font-size:12px; color:#999; line-height:1.7; padding:14px 4px; text-align:center;">'
                        + '還沒收藏過。<br>調好一套之後在上面取個名字、按「收藏目前」，<br>以後換到誰的聊天室都能一鍵套上去。</div>';
                    return;
                }
                listEl.innerHTML = arr.map(t => `<div class="wx-bubble-gal-card" style="border:1px solid #e5e5e5; border-radius:8px; overflow:hidden; background:#fff;">
                    <iframe sandbox="allow-same-origin" scrolling="no" style="width:100%; height:88px; border:none; display:block; background:#eaeaea;"></iframe>
                    <div style="display:flex; align-items:center; gap:6px; padding:6px 8px; border-top:1px solid #f0f0f0;">
                        <span style="flex:1; min-width:0; font-size:13px; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(t.name)}</span>
                        <button data-act="apply" class="wx-btn" style="background:#07c160; color:#fff; border:none; padding:5px 12px; font-size:12px;">套用</button>
                        <button data-act="del" class="wx-btn" style="background:#f7f7f7; color:#999; border:1px solid #e5e5e5; padding:5px 9px; font-size:12px;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`).join('');

                const cards = listEl.querySelectorAll('.wx-bubble-gal-card');
                arr.forEach((t, i) => {
                    const card = cards[i]; if (!card) return;
                    try { card.querySelector('iframe').srcdoc = AI.buildThumb(t.css); } catch (e) {}
                    card.querySelector('[data-act="apply"]').onclick = (e) => {
                        tempConfig.aiCSS = t.css || '';
                        tempConfig.mode = 'ai';
                        this.saveConfig(chatId, tempConfig);
                        updatePreview();
                        flash(e.currentTarget, '✓ 套好了');
                    };
                    // 🚨window.confirm 在 Tauri 會被攔掉（按了完全沒反應），一律兩段式
                    const delBtn = card.querySelector('[data-act="del"]');
                    let armed = false, timer = 0;
                    delBtn.onclick = () => {
                        if (!armed) {
                            armed = true; delBtn.innerHTML = '再按一次';
                            timer = setTimeout(() => { armed = false; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>'; }, 4000);
                            return;
                        }
                        armed = false; clearTimeout(timer);
                        AI.galRemove(t.id); render();
                    };
                });
            };
            render();

            addBtn.onclick = () => {
                const name = (nameEl.value || '').trim();
                if (!name) { hint('先取個名字再收藏'); nameEl.focus(); return; }
                const css = currentCss();
                if (!css.trim() || /^\/\*\s*尚未設定\s*\*\/$/.test(css.trim())) { hint('現在這頁還沒有東西可以收'); return; }
                // 🚨localStorage 撞上限時是靜默失敗的，存不進去一定要講，不然她以為收好了
                if (!AI.galAdd(name, css)) { hint('存不進去，瀏覽器的空間滿了'); return; }
                nameEl.value = '';
                render();
                flash(addBtn, '✓ 收好了');
            };
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
            // observer 單例＋善後即拆：這裡每次開面板都會跑，不拆的話同一個 modal 上會疊一堆 observer 越玩越卡
            if (this._modalObserver) this._modalObserver.disconnect();
            this._modalObserver = new MutationObserver(() => {
                if (!modal.classList.contains('show')) {
                    // 面板關掉（按關閉、點遮罩都算）→ 把即時預覽注入的那份丟掉，
                    // 回到真正存下來的設定。不然「看了一下沒保存」會留在畫面上。
                    try { if (this._curChatId) this.applyStyle(this._curChatId); } catch (e) {}
                    customContainer.innerHTML = '';
                    ['wxModalTitle', 'wxModalInput'].forEach(id => { const el = doc.getElementById(id); if(el) el.style.display = 'block'; });
                    if(footer) footer.style.display = 'flex';
                    if (this._modalObserver) { this._modalObserver.disconnect(); this._modalObserver = null; }
                }
            });
            this._modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    };
})();