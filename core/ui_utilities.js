/**
 * ========================
 * Aurelia UI Utilities (Lite)
 * UI 工具箱 - 負責圖標定位、訊息折疊與動態島佈局避讓
 * 版本：3.1.0-layout-fix
 * ========================
 */
(function() {
    'use strict';

    // 🔥 獲取設置的輔助函數，確保能讀到開關狀態
    function getExtensionSettings() {
        let settings = window.extension_settings && window.extension_settings['多功能面板系統'];
        if (!settings) {
            try {
                const saved = localStorage.getItem('extension_settings');
                if (saved) settings = JSON.parse(saved)['多功能面板系統'];
            } catch (e) {}
        }
        return settings || { messageCollapse: true };
    }

    // ========================
    // 1. 圖標管理器 (負責創建與定位)
    // ========================
    const IconManager = {
        iconElement: null,

        init() {
            this.createIcon();
            // 初始定位嘗試（一次性，建立後立即定位或隱藏）
            if (window.innerWidth >= 768) this.moveToInputBox();
            else this.moveToQRBar();
            this.handleResize();
            this.watchChatChange();
        },

        createIcon() {
            // 如果已經有了就不要重複創
            if (document.getElementById('aurelia-floating-icon')) return;

            const icon = document.createElement('div');
            icon.id = 'aurelia-floating-icon';
            // 預設隱藏，由 moveToInputBox / moveToQRBar 放定位後再顯示
            icon.style.display = 'none';

            // 點擊事件：切換控制中心
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (window.AureliaControlCenter) {
                    window.AureliaControlCenter.toggle();
                } else {
                    console.warn('控制中心尚未加載');
                }
            });

            document.body.appendChild(icon);
            this.iconElement = icon;
        },

        // 桌面端邏輯：把圖標塞進輸入框 (LeftSendForm)
        moveToInputBox() {
            const leftSendForm = document.getElementById('leftSendForm');
            const icon = document.getElementById('aurelia-floating-icon');

            if (leftSendForm && icon) {
                if (icon.parentElement === leftSendForm) return;

                icon.className = '';
                icon.innerHTML = '🏰';
                Object.assign(icon.style, {
                    position: 'static',
                    width: '30px',
                    height: '30px',
                    borderRadius: '5px',
                    marginRight: '4px',
                    marginLeft: '2px',
                    boxShadow: 'none',
                    transform: 'none',
                    fontSize: '18px',
                    flexShrink: '0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                });

                leftSendForm.insertBefore(icon, leftSendForm.firstChild);
            }
        },

        // 移動端邏輯：嵌入 QR 欄 (#qr--bar) 的內層 .qr--buttons
        // 找不到 QR bar（聊天清單頁等）→ 隱藏，避免浮球亂跑
        moveToQRBar() {
            const icon = document.getElementById('aurelia-floating-icon');
            if (!icon) return;

            const qrBar = document.getElementById('qr--bar');
            if (!qrBar) {
                icon.style.display = 'none';
                return;
            }

            // 塞進內層 .qr--buttons wrapper，與其他 QR 按鈕並排（避免成為獨立 flex 項目產生隔間）
            const innerBtns = qrBar.querySelector(':scope > .qr--buttons');
            const target = innerBtns || qrBar;

            if (icon.parentElement === target) {
                icon.style.display = '';   // 確保可見（從隱藏狀態復原）
                return;
            }

            icon.style.cssText = 'cursor:pointer; flex-shrink:0;';
            icon.className = 'qr--button menu_button interactable';
            icon.innerHTML = '<div class="qr--button-label">🏰 奧瑞亞</div>';
            icon.title = '奧瑞亞面板';
            target.appendChild(icon);
        },

        handleResize() {
            window.addEventListener('resize', () => {
                if (window.innerWidth >= 768) this.moveToInputBox();
                else this.moveToQRBar();
            });
        },

        // chatId 切換時立即重新注入（參考 index.js chat_id_changed 模式）
        watchChatChange() {
            const reinit = () => {
                // 等 ST 重建 DOM 完成後再定位（同 index.js 用 200ms 延遲）
                setTimeout(() => {
                    if (!document.getElementById('aurelia-floating-icon')) {
                        this.createIcon();
                    }
                    if (window.innerWidth >= 768) this.moveToInputBox();
                    else this.moveToQRBar();
                }, 200);
            };

            // 嘗試綁定事件；若 eventOn 尚未就緒則輪詢等待（最多 15 秒）
            const tryBind = () => {
                if (typeof window.eventOn !== 'function') return false;
                window.eventOn('chat_id_changed', reinit);
                window.eventOn('character_loaded', reinit);
                console.log('[AureliaUI] ✅ 已綁定 chat_id_changed / character_loaded');
                return true;
            };

            if (!tryBind()) {
                let attempts = 0;
                const t = setInterval(() => {
                    if (tryBind() || ++attempts > 30) clearInterval(t);
                }, 500);
            }
        }
    };

    // ========================
    // 2. 訊息折疊功能 (Message Collapser)
    // ========================
    const MessageCollapser = {
        processedIds: new Set(),
        observer: null,

        init() {
            // 延遲一點執行，等待聊天室渲染
            setTimeout(() => {
                this.processExistingMessages();
                this.startObserver();
            }, 1000);
            
            // 暴露給外部重新初始化 (例如切換聊天室時)
            window.reinitializeCollapseFeature = () => {
                this.processedIds.clear();
                this.processExistingMessages();
            };
        },

        processExistingMessages() {
            const settings = getExtensionSettings();
            if (settings.messageCollapse === false) return; // 🔥 尊重開關設置
            
            const chat = document.getElementById('chat');
            if (!chat) return;
            const messages = chat.querySelectorAll('.mes');
            messages.forEach(msg => this.addCollapseButton(msg));
        },

        addCollapseButton(msgElement) {
            const settings = getExtensionSettings();
            if (settings.messageCollapse === false) return; // 🔥 尊重開關設置

            // 跳過系統消息或已處理的消息
            if (msgElement.classList.contains('smallSysMes')) return;
            const mesId = msgElement.getAttribute('mesid');
            if (!mesId || this.processedIds.has(mesId)) return;

            this.processedIds.add(mesId);

            // 尋找標題列 (名字的地方)
            const chName = msgElement.querySelector('.ch_name');
            if (!chName) return;

            // 檢查是否已經加過按鈕
            if (chName.querySelector('.mes-collapse-btn')) return;

            // 創建折疊按鈕
            const btn = document.createElement('div');
            btn.className = 'mes-collapse-btn';
            btn.innerHTML = '︿'; // 使用簡單的字符，如果您有 FontAwesome 可以換成 <i class="fa-solid fa-chevron-up"></i>
            btn.style.cssText = `
                display: inline-flex; align-items: center; justify-content: center;
                cursor: pointer; margin-right: 8px; opacity: 0.5; 
                width: 20px; height: 20px; font-size: 12px;
                background: rgba(0,0,0,0.1); border-radius: 4px;
                transition: all 0.2s; user-select: none;
            `;
            
            // 為了美觀，嘗試使用 FontAwesome (如果有的話)
            const checkFontAwesome = document.querySelector('link[href*="font-awesome"]');
            if (checkFontAwesome) {
                btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
            }

            btn.onmouseenter = () => { btn.style.opacity = '1'; btn.style.background = 'rgba(0,0,0,0.2)'; };
            btn.onmouseleave = () => { btn.style.opacity = '0.5'; btn.style.background = 'rgba(0,0,0,0.1)'; };

            // 插入按鈕到名字最前面
            const nameContainer = chName.querySelector('.flex-container') || chName;
            if (nameContainer.firstChild) {
                nameContainer.insertBefore(btn, nameContainer.firstChild);
            } else {
                nameContainer.appendChild(btn);
            }

            // 🔥 判斷是否為酒館的隱藏訊息 (自動折疊邏輯)
            const isHiddenMsg = msgElement.getAttribute('is_hidden') === 'true' || msgElement.classList.contains('is_hidden');
            
            // 讀取記憶狀態
            const storageKey = `mes-collapse-${mesId}`;
            let storedState = localStorage.getItem(storageKey);
            let isCollapsed = false;

            if (storedState === null) {
                // 如果用戶沒有手動設定過，且這是隱藏訊息，則預設自動折疊
                isCollapsed = isHiddenMsg;
            } else {
                isCollapsed = storedState === 'true';
            }

            // 執行折疊/展開邏輯
            const toggle = (collapsed) => {
                const block = msgElement.querySelector('.mes_block');
                const avatar = msgElement.querySelector('.mesAvatarWrapper');
                
                // 內容區
                if (block) {
                    Array.from(block.children).forEach(child => {
                        // 保留標題列(ch_name)和編輯按鈕(mes_edit_buttons)，隱藏其他文字內容
                        if (!child.classList.contains('ch_name') && !child.classList.contains('mes_edit_buttons')) {
                            child.style.display = collapsed ? 'none' : '';
                        }
                    });
                }
                // 頭像區
                if (avatar) avatar.style.display = collapsed ? 'none' : '';
                
                // 更新圖標
                if (checkFontAwesome) {
                    btn.innerHTML = collapsed ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-up"></i>';
                } else {
                    btn.innerHTML = collapsed ? '﹀' : '︿';
                }
                
                // 保存狀態
                localStorage.setItem(storageKey, collapsed);
            };

            // 初始狀態應用
            if (isCollapsed) toggle(true);

            // 綁定點擊
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isCollapsed = !isCollapsed;
                toggle(isCollapsed);
            });
        },

        startObserver() {
            const chat = document.getElementById('chat');
            if (!chat) return;

            // 監聽新消息加入
            this.observer = new MutationObserver((mutations) => {
                const settings = getExtensionSettings();
                if (settings.messageCollapse === false) return; // 🔥 沒開就不加按鈕
                
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.classList.contains('mes')) {
                            this.addCollapseButton(node);
                        }
                    });
                });
            });

            this.observer.observe(chat, { childList: true });
        }
    };

    // ========================
    // 3. 佈局形態管理器 (Layout Manager - 解決動態島遮擋)
    // ========================
    const LayoutManager = {
        modes: ['default', 'notch', 'compact'],
        currentMode: 'default',

        init() {
            this.injectStyles();
            this.createFloatingButton();
            this.loadState();
        },

        injectStyles() {
            if (document.getElementById('aurelia-layout-styles')) return;
            const style = document.createElement('style');
            style.id = 'aurelia-layout-styles';
            style.innerHTML = `
                /* 形態切換器 UI - 放置於安全區域 */
                #aurelia-layout-btn {
                    position: fixed; top: 15px; left: 15px; z-index: 100000;
                    width: 32px; height: 32px; background: rgba(0,0,0,0.4);
                    color: #fff; border-radius: 50%; display: flex; align-items: center;
                    justify-content: center; cursor: pointer; backdrop-filter: blur(5px);
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2); transition: 0.3s;
                    font-size: 14px;
                }
                #aurelia-layout-btn:hover { background: rgba(0,0,0,0.7); transform: scale(1.1); }
                
                #aurelia-layout-panel {
                    position: fixed; top: 55px; left: 15px; z-index: 100000;
                    background: rgba(255,255,255,0.95); backdrop-filter: blur(10px);
                    border: 1px solid #cbd5e0; border-radius: 8px; padding: 10px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: none;
                    flex-direction: column; gap: 8px; width: 140px;
                }
                .layout-option-btn {
                    padding: 8px 10px; background: transparent; border: 1px solid #e2e8f0;
                    border-radius: 6px; font-size: 12px; color: #4a5568; cursor: pointer;
                    text-align: left; transition: 0.2s; font-weight: bold;
                }
                .layout-option-btn.active {
                    background: #ebf8ff; border-color: #63b3ed; color: #2b6cb0;
                }
                .layout-option-btn:hover:not(.active) { background: #f7fafc; }

                /* === 瀏海/動態島模式 (Notch Mode) === 
                   針對 void_terminal 渲染出來的各個面板，強迫加上頂部 padding 避開動態島 
                */
                body.layout-notch .void-top-bar { padding-top: 45px !important; }
                body.layout-notch .void-app-tray { top: 85px !important; }
                body.layout-notch .void-bubble-layer { top: 85px !important; }
                body.layout-notch .hist-header,
                body.layout-notch .ach-header,
                body.layout-notch .store-header { padding-top: 45px !important; }
                body.layout-notch .void-session-topbar { padding-top: 45px !important; }
                body.layout-notch .void-login-container { padding-top: 50px !important; }
                /* 404 崩潰模式同理 */
                body.layout-notch .void-tab.mode-404 .void-top-bar { padding-top: 45px !important; }

                /* === 緊湊模式 (Compact Mode) === 
                   專門給小螢幕手機，擠壓 UI 以換取更多空間 
                */
                body.layout-compact .void-top-bar { padding: 5px 15px !important; }
                body.layout-compact .void-app-tray { top: 40px !important; padding: 4px 8px !important; }
                body.layout-compact .void-char-area { bottom: 70px !important; height: 70% !important; }
                body.layout-compact .void-dialogue-wrap { bottom: 70px !important; }
                body.layout-compact .void-chat-bar { padding: 4px 8px !important; }
            `;
            document.head.appendChild(style);
        },

        createFloatingButton() {
            if (document.getElementById('aurelia-layout-btn')) return;

            const btn = document.createElement('div');
            btn.id = 'aurelia-layout-btn';
            btn.title = '切換佈局形態 (避開動態島)';
            btn.innerHTML = '📱';
            
            const panel = document.createElement('div');
            panel.id = 'aurelia-layout-panel';
            
            const options = [
                { id: 'default', name: '📱 預設形態' },
                { id: 'notch', name: '🏝️ 動態島避讓' },
                { id: 'compact', name: '🗜️ 緊湊形態' }
            ];

            options.forEach(opt => {
                const obtn = document.createElement('button');
                obtn.className = 'layout-option-btn';
                obtn.dataset.mode = opt.id;
                obtn.innerText = opt.name;
                obtn.onclick = () => {
                    this.setMode(opt.id);
                    panel.style.display = 'none';
                };
                panel.appendChild(obtn);
            });

            btn.onclick = (e) => {
                e.stopPropagation();
                panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
            };

            document.body.appendChild(btn);
            document.body.appendChild(panel);

            // 點擊空白處關閉
            document.addEventListener('click', (e) => {
                if (!panel.contains(e.target) && e.target !== btn) {
                    panel.style.display = 'none';
                }
            });
        },

        setMode(mode) {
            this.currentMode = mode;
            // 移除舊的佈局 class，加上新的
            document.body.classList.remove('layout-default', 'layout-notch', 'layout-compact');
            document.body.classList.add('layout-' + mode);
            
            // 更新 UI 狀態
            document.querySelectorAll('.layout-option-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });

            // 儲存至本地端，確保重新整理依然有效
            localStorage.setItem('aurelia_layout_mode', mode);
            console.log('[LayoutManager] 佈局已切換為:', mode);
        },

        loadState() {
            const savedMode = localStorage.getItem('aurelia_layout_mode') || 'default';
            this.setMode(savedMode);
        }
    };

    // ========================
    // 4. 純白大廳 / 404 號房 全域樣式
    //    其他模組可呼叫 window.AureliaVoidStyles.inject(bgUrl) 確保樣式已注入
    // ========================
    const VoidStyles = {
        inject(bgUrl) {
            // 無論是否已注入，先更新背景 CSS 變數（允許動態換圖）
            if (bgUrl) {
                document.documentElement.style.setProperty('--void-bg-url', `url(${bgUrl})`);
            }
            if (document.getElementById('void-terminal-styles')) return;

            const style = document.createElement('style');
            style.id = 'void-terminal-styles';
            style.innerHTML = `
                @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;700&display=swap');

                /* ===== 基礎框架 ===== */
                .void-tab { width:100%; height:100%; display:flex; flex-direction:column; position:relative; overflow:hidden; background:#f8f9fa; font-family:'Noto Sans TC',sans-serif; }
                .void-bg { position:absolute; inset:0; z-index:0; pointer-events:none; background:linear-gradient(135deg,#ffffff 0%,#eef2f5 50%,#e0e5ec 100%); background-image:var(--void-bg-url,none); background-size:cover; background-position:center; opacity:0.8; }
                .void-grid { position:absolute; inset:0; z-index:1; pointer-events:none; background-image:linear-gradient(rgba(200,200,200,0.2) 1px,transparent 1px),linear-gradient(90deg,rgba(200,200,200,0.2) 1px,transparent 1px); background-size:30px 30px; opacity:0.5; }

                /* ===== 頂欄 ===== */
                .void-top-bar { position:absolute; top:0; left:0; right:0; z-index:16; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; background:linear-gradient(to bottom,rgba(255,255,255,0.9) 0%,transparent 100%); }

                /* ===== 系統工具下拉選單 ===== */
                #lobby-sys-menu { position:relative; flex-shrink:0; }
                #lobby-prompts-btn { background:none; border:1px solid rgba(0,0,0,0.12); border-radius:7px; cursor:pointer; font-size:13px; padding:5px 8px; line-height:1; opacity:0.65; transition:all 0.2s; color:#4a5568; display:flex; align-items:center; gap:5px; }
                #lobby-prompts-btn span { font-size:9px; font-weight:600; letter-spacing:0.5px; }
                #lobby-prompts-btn:hover, #lobby-prompts-btn.open { opacity:1; border-color:rgba(0,0,0,0.22); background:rgba(0,0,0,0.04); }
                .void-sys-dropdown { position:absolute; top:calc(100% + 5px); left:0; background:rgba(252,252,254,0.97); backdrop-filter:blur(14px); border:1px solid rgba(0,0,0,0.12); border-radius:9px; box-shadow:0 6px 20px rgba(0,0,0,0.13); min-width:130px; z-index:30; overflow:hidden; animation:dropIn 0.15s ease; }
                @keyframes dropIn { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
                .void-sys-dropdown-item { display:flex; align-items:center; gap:9px; padding:10px 14px; font-size:12px; color:#4a5568; cursor:pointer; transition:background 0.13s; border-bottom:1px solid rgba(0,0,0,0.05); }
                .void-sys-dropdown-item:last-child { border-bottom:none; }
                .void-sys-dropdown-item:hover { background:rgba(0,0,0,0.05); color:#1a202c; }
                .void-sys-dropdown-item i { font-size:11px; width:13px; text-align:center; opacity:0.8; }

                /* ===== 立繪 ===== */
                .void-char-area { position:absolute; bottom:90px; left:50%; transform:translateX(-50%); z-index:5; width:100%; max-width:640px; height:78%; display:flex; justify-content:center; align-items:flex-end; }
                .void-char-img { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; filter:drop-shadow(0 12px 28px rgba(0,0,0,0.12)); transition:transform 0.3s ease, opacity 0.35s ease; }

                /* ===== 對話框 ===== */
                .void-dialogue-wrap { position:absolute; bottom:90px; left:0; right:0; z-index:10; padding:10px 15px; }
                .void-dialogue-box { background:rgba(255,255,255,0.65); backdrop-filter:blur(25px); -webkit-backdrop-filter:blur(25px); border:1px solid rgba(255,255,255,0.9); border-radius:4px; padding:15px 20px; box-shadow:0 10px 40px rgba(150,160,180,0.2); position:relative; cursor:pointer; min-height:60px; }
                .void-name-tag { position:absolute; top:-14px; left:20px; background:#e0e5ec; color:#4a5568; padding:4px 18px; font-weight:bold; font-size:11px; box-shadow:2px 2px 5px rgba(0,0,0,0.05); letter-spacing:1px; transform:skewX(-15deg); border:1px solid rgba(255,255,255,0.8); }
                .void-name-tag > span { display:block; transform:skewX(15deg); }
                .void-text { font-size:13px; color:#2d3748; line-height:1.7; font-weight:500; }
                @keyframes void-blink { 0%,100%{opacity:1} 50%{opacity:0} }
                .void-next { position:absolute; bottom:8px; right:15px; font-size:12px; color:#a0aec0; animation:void-blink 1.2s infinite; display:none; }

                /* ===== 輸入欄 ===== */
                .void-chat-bar { position:absolute; bottom:0; left:0; right:0; z-index:15; height:auto; background:rgba(255,255,255,0.85); backdrop-filter:blur(10px); border-top:1px solid rgba(220,225,230,0.5); display:flex; flex-direction:column; padding:6px 12px; gap:5px; }
                .void-chat-btns { display:flex; gap:6px; align-items:center; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; }
                .void-chat-btns::-webkit-scrollbar { display:none; }
                .void-chat-input-row { display:flex; gap:8px; align-items:center; }
                .void-input { flex:1; background:#eef2f5; border:1px solid transparent; color:#2d3748; padding:10px 16px; border-radius:2px; font-size:13px; outline:none; transition:0.2s; transform:skewX(-5deg); }
                .void-input:focus { background:#fff; border-color:#cbd5e0; box-shadow:0 0 0 2px rgba(200,210,220,0.3); }
                .void-send-btn { width:36px; height:36px; background:#cbd5e0; border-radius:2px; border:none; color:#2d3748; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:2px 2px 5px rgba(0,0,0,0.05); transition:0.2s; transform:skewX(-10deg); }
                .void-send-btn > i { transform:skewX(10deg); }
                .void-send-btn:hover { background:#a0aec0; color:#fff; }
                .void-send-btn:active { transform:skewX(-10deg) translateY(2px); }
                .void-retry-btn { display:none; width:36px; height:36px; background:#f6ad55; border-radius:2px; border:none; color:#fff; cursor:pointer; align-items:center; justify-content:center; font-size:15px; box-shadow:2px 2px 5px rgba(0,0,0,0.1); transition:0.2s; transform:skewX(-10deg); flex-shrink:0; }
                .void-retry-btn.visible { display:flex; }
                .void-retry-btn > i { transform:skewX(10deg); }
                .void-retry-btn:hover { background:#ed8936; box-shadow:0 0 8px rgba(246,173,85,0.5); }
                .void-retry-btn:active { transform:skewX(-10deg) translateY(2px); }

                /* ===== 歷史按鈕 ===== */
                .void-hist-btn { flex-shrink:0; background:none; border:1px solid rgba(0,0,0,0.13); border-radius:7px; padding:3px 6px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px; color:#718096; transition:all 0.2s; line-height:1; }
                .void-hist-btn i { font-size:10px; }
                .void-hist-btn span { font-size:8px; white-space:nowrap; }
                .void-hist-btn:hover { background:rgba(0,0,0,0.07); color:#4a5568; border-color:rgba(0,0,0,0.22); }

                /* ===== 世界頻道泡泡 (聊天欄模式) ===== */
                .void-bubble-layer { position:absolute; right:8px; top:56px; bottom:100px; width:162px; z-index:8; pointer-events:none; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end; align-items:flex-end; gap:5px; background:transparent; }
                .void-bubble { position:relative; width:100%; max-width:162px; background:rgba(255,255,255,0.82); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.95); border-radius:16px; padding:8px 11px; box-shadow:0 6px 24px rgba(0,0,0,0.06),0 2px 6px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.9); opacity:0; animation:bubblePop 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards; flex-shrink:0; box-sizing:border-box; }
                @keyframes bubblePop { 0%{opacity:0;transform:scale(0.1)} 65%{opacity:1;transform:scale(1.07)} 100%{opacity:1;transform:scale(1)} }
                @keyframes bubbleFadeOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.88) translateY(-6px)} }
                .void-bubble-tag { display:inline-block; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--bc,#63b3ed); font-family:'Courier New',monospace; background:rgba(var(--bc-rgb,99,179,237),0.1); padding:1px 6px; border-radius:20px; margin-bottom:5px; }
                .void-bubble-text { font-size:11px; color:#2d3748; line-height:1.45; font-weight:500; }
                @media (max-width:680px) { .void-bubble-layer { display:none; } }

                /* ===== 斜角按鈕 ===== */
                .void-btn-wrap { display:flex; gap:8px; }
                .void-btn { padding:6px 16px; background:rgba(255,255,255,0.7); border:1px solid rgba(200,210,220,0.6); cursor:pointer; color:#2d3748; font-size:11px; font-weight:800; backdrop-filter:blur(5px); box-shadow:2px 2px 10px rgba(0,0,0,0.05); transition:all 0.25s cubic-bezier(0.2,0.8,0.2,1); transform:skewX(-15deg); border-radius:2px; position:relative; overflow:hidden; }
                .void-btn::before { content:'public'; position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent); transform:skewX(-20deg); transition:0s; }
                .void-btn:hover::before { left:200%; transition:0.6s ease-in-out; }
                .void-btn:hover { background:#fff; border-color:#63b3ed; color:#2b6cb0; transform:skewX(-15deg) translateY(-2px); box-shadow:0 5px 15px rgba(99,179,237,0.25); }
                .void-btn-inner { transform:skewX(15deg); display:flex; align-items:center; gap:6px; letter-spacing:0.5px; }

                /* ===== APP 快速啟動列 ===== */
                .void-app-tray { position:absolute; top:56px; left:0; right:0; z-index:9; display:flex; gap:7px; padding:8px 12px; overflow-x:auto; overflow-y:visible; scrollbar-width:none; }
                .void-app-tray::-webkit-scrollbar { display:none; }
                .void-app-icon { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:50px; cursor:pointer; padding:7px 5px; flex-shrink:0; background:rgba(255,255,255,0.62); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,0.92); border-radius:13px; box-shadow:0 3px 10px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.9); transition:all 0.2s cubic-bezier(0.2,0.8,0.2,1); -webkit-tap-highlight-color:transparent; }
                .void-app-icon:hover { background:rgba(255,255,255,0.9); transform:translateY(-3px); box-shadow:0 6px 16px rgba(0,0,0,0.1); }
                .void-app-icon:active { transform:translateY(0px); box-shadow:0 2px 6px rgba(0,0,0,0.08); }
                .void-app-icon-emoji { font-size:19px; line-height:1; }
                .void-app-icon-label { font-size:8px; font-weight:800; color:#4a5568; letter-spacing:0.3px; white-space:nowrap; font-family:'Noto Sans TC',sans-serif; }

                /* ===== ERR_404 崩潰動畫 ===== */
                @keyframes glitchCrash { 0%{filter:none;transform:none} 12%{filter:hue-rotate(90deg) saturate(8) brightness(1.5);transform:skewX(6deg) scaleY(1.02)} 24%{filter:invert(1) brightness(2);transform:skewX(-4deg) translateY(-3px)} 36%{filter:brightness(0.1);transform:scaleX(1.03) skewX(2deg)} 50%{filter:invert(1) hue-rotate(180deg) saturate(12);transform:skewX(-6deg) scaleY(0.98)} 65%{filter:brightness(5) contrast(10);transform:none} 80%{filter:brightness(0);transform:none} 100%{filter:none;transform:none} }
                .void-tab.glitch-crash { animation:glitchCrash 0.55s steps(3) forwards; pointer-events:none; }

                /* ===== 資料面板 ===== */
                .void-panel-overlay { position:absolute; top:90px; bottom:142px; left:12px; right:12px; z-index:9; background:rgba(255,255,255,0.75); backdrop-filter:blur(28px); -webkit-backdrop-filter:blur(28px); border:1px solid rgba(255,255,255,0.95); border-radius:4px; box-shadow:0 8px 32px rgba(150,160,180,0.18),inset 0 1px 0 rgba(255,255,255,0.9); display:flex; flex-direction:column; overflow:hidden; animation:panelSlideIn 0.28s cubic-bezier(0.2,0.8,0.2,1) forwards; }
                @keyframes panelSlideIn { from{opacity:0;transform:translateY(12px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                .void-panel-header { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; flex-shrink:0; border-bottom:1px solid rgba(200,210,220,0.4); background:rgba(255,255,255,0.55); }
                .void-panel-title { font-size:10px; font-weight:800; color:#1a202c; letter-spacing:2px; text-transform:uppercase; font-family:'Courier New',monospace; }
                .void-panel-close { background:none; border:none; cursor:pointer; font-size:13px; color:#a0aec0; padding:2px 6px; border-radius:2px; transition:0.2s; line-height:1; }
                .void-panel-close:hover { color:#2d3748; background:rgba(0,0,0,0.06); }
                .void-panel-body { flex:1; overflow-y:auto; padding:6px 8px; scrollbar-width:thin; scrollbar-color:rgba(200,210,220,0.5) transparent; }
                .void-panel-list { display:flex; flex-direction:column; gap:5px; }
                .void-panel-item { display:flex; align-items:center; gap:10px; padding:9px 12px; background:rgba(255,255,255,0.58); border:1px solid rgba(200,210,220,0.32); border-radius:3px; cursor:pointer; transform:skewX(-4deg); transition:all 0.18s cubic-bezier(0.2,0.8,0.2,1); }
                .void-panel-item:hover { background:rgba(255,255,255,0.92); border-color:#63b3ed; transform:skewX(-4deg) translateX(4px); box-shadow:0 3px 12px rgba(99,179,237,0.15); }
                .void-panel-item-rank { font-size:9px; font-weight:900; color:#a0aec0; font-family:'Courier New',monospace; transform:skewX(4deg); min-width:16px; }
                .void-panel-item-main { flex:1; transform:skewX(4deg); min-width:0; }
                .void-panel-item-name { display:block; font-size:12px; font-weight:700; color:#2d3748; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .void-panel-item-tag { display:block; font-size:9px; color:#718096; margin-top:1px; letter-spacing:0.5px; }
                .void-panel-item-stat { font-size:11px; font-weight:700; color:#2b6cb0; transform:skewX(4deg); white-space:nowrap; }
                .void-panel-item-arrow { font-size:16px; color:#a0aec0; transform:skewX(4deg); line-height:1; }
                .void-panel-detail { flex-direction:column; gap:8px; }
                .void-panel-detail-header { display:flex; align-items:center; gap:10px; padding-bottom:8px; border-bottom:1px solid rgba(200,210,220,0.3); }
                .void-panel-back { background:rgba(200,210,220,0.28); border:none; cursor:pointer; font-size:11px; color:#4a5568; padding:4px 10px; border-radius:2px; transform:skewX(-8deg); transition:0.2s; white-space:nowrap; }
                .void-panel-back:hover { background:rgba(99,179,237,0.15); color:#2b6cb0; }
                .void-panel-detail-name { font-size:12px; font-weight:800; color:#1a202c; letter-spacing:0.5px; }
                .void-panel-detail-body { font-size:12px; color:#2d3748; line-height:1.75; font-weight:500; }

                /* ===== 歷史對話面板 ===== */
                #iris-history-overlay { position:absolute; inset:0; z-index:20; background:rgba(8,8,18,0.97); display:flex; flex-direction:column; animation:histIn 0.22s ease; }
                @keyframes histIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
                .hist-header { display:flex; align-items:center; justify-content:space-between; padding:11px 14px 9px; border-bottom:1px solid rgba(255,255,255,0.07); flex-shrink:0; }
                .hist-title { font-size:12px; font-weight:700; color:#c8d4e8; letter-spacing:1.5px; text-transform:uppercase; }
                .hist-char-badge { font-size:9px; padding:2px 7px; border-radius:10px; margin-left:8px; font-weight:600; letter-spacing:0.3px; }
                .hist-char-badge.iris { background:rgba(120,180,255,0.18); color:#7ab4ff; border:1px solid rgba(120,180,255,0.3); }
                .hist-char-badge.cheshire { background:rgba(0,255,65,0.12); color:#00cc33; border:1px solid rgba(0,255,65,0.28); }
                .hist-close { background:none; border:none; color:#555; font-size:15px; cursor:pointer; padding:2px 6px; transition:color 0.18s; line-height:1; }
                .hist-close:hover { color:#bbb; }
                .hist-toolbar { display:flex; align-items:center; gap:6px; padding:7px 12px; border-bottom:1px solid rgba(255,255,255,0.05); flex-shrink:0; flex-wrap:wrap; }
                .hist-check-all-label { display:flex; align-items:center; gap:4px; font-size:10px; color:#777; cursor:pointer; user-select:none; margin-right:2px; }
                .hist-check-all-label input { accent-color:#7ab4ff; cursor:pointer; width:13px; height:13px; }
                .hist-count { font-size:10px; color:#444; margin-left:auto; font-family:monospace; }
                .hist-action-btn { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:5px; padding:4px 9px; font-size:10px; color:#999; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
                .hist-action-btn:hover:not(:disabled) { background:rgba(255,255,255,0.11); color:#ddd; }
                .hist-action-btn:disabled { opacity:0.28; cursor:default; }
                .hist-action-btn.danger { color:#e08080; border-color:rgba(255,80,80,0.2); }
                .hist-action-btn.danger:hover:not(:disabled) { background:rgba(255,60,60,0.13); color:#ff7070; }
                .hist-list { flex:1; overflow-y:auto; padding:6px 8px; }
                .hist-list::-webkit-scrollbar { width:3px; }
                .hist-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
                .hist-empty { text-align:center; color:#333344; font-size:12px; padding:40px 20px; letter-spacing:1px; }
                .hist-item { display:flex; align-items:flex-start; gap:7px; padding:7px 9px; border-radius:5px; margin-bottom:3px; border:1px solid transparent; transition:background 0.15s; }
                .hist-item:hover { background:rgba(255,255,255,0.03); }
                .hist-item.selected { background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.09); }
                .hist-item-check { flex-shrink:0; margin-top:3px; cursor:pointer; accent-color:#7ab4ff; width:13px; height:13px; }
                .hist-role-badge { flex-shrink:0; font-size:8px; font-weight:700; padding:2px 5px; border-radius:3px; margin-top:2px; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; }
                .hist-role-badge.user { background:rgba(120,180,255,0.13); color:#7ab4ff; }
                .hist-role-badge.ai { background:rgba(160,120,255,0.13); color:#b09aff; }
                .hist-role-badge.ai.cheshire { background:rgba(0,255,65,0.10); color:#00cc33; }
                .hist-item-body { flex:1; min-width:0; }
                .hist-item-text { font-size:11px; color:#8a9baa; line-height:1.55; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; white-space:pre-wrap; cursor:pointer; transition:color 0.15s; }
                .hist-item-text.expanded { display:block; -webkit-line-clamp:unset; }
                .hist-item-text:hover { color:#b0c0cc; }
                .hist-item-actions { display:flex; gap:3px; flex-shrink:0; margin-top:1px; }
                .hist-icon-btn { background:none; border:none; color:#3a3a50; font-size:12px; cursor:pointer; padding:2px 4px; border-radius:3px; line-height:1; transition:all 0.15s; }
                .hist-icon-btn:hover { background:rgba(255,255,255,0.07); color:#888; }
                .hist-icon-btn.edit:hover { color:#7ab4ff; }
                .hist-icon-btn.rollback:hover { color:#ffc800; }
                .hist-item-edit-area { width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.14); border-radius:4px; color:#ccd; font-size:11px; padding:5px 7px; font-family:monospace; line-height:1.5; resize:vertical; min-height:56px; box-sizing:border-box; }
                .hist-edit-confirm-row { display:flex; gap:5px; margin-top:5px; }
                .hist-edit-confirm-btn { background:rgba(120,180,255,0.13); border:1px solid rgba(120,180,255,0.3); border-radius:4px; color:#7ab4ff; font-size:10px; padding:3px 9px; cursor:pointer; }
                .hist-edit-cancel-btn { background:transparent; border:1px solid rgba(255,255,255,0.1); border-radius:4px; color:#555; font-size:10px; padding:3px 9px; cursor:pointer; }

                /* ===== 404 模式：大廳全域覆蓋 ===== */
                .void-tab.mode-404 .void-bg { background-image:url('https://files.catbox.moe/3ub4va.png') !important; background-size:cover !important; background-position:center !important; opacity:1 !important; }
                .void-tab.mode-404 .void-grid { background-image:linear-gradient(rgba(0,255,65,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,65,0.12) 1px,transparent 1px) !important; }
                .void-tab.mode-404 .void-top-bar { background:linear-gradient(to bottom,rgba(0,8,0,0.92) 0%,transparent 100%) !important; }
                .void-tab.mode-404 .void-dialogue-box { background:rgba(0,5,0,0.78) !important; border-color:rgba(0,255,65,0.35) !important; box-shadow:0 10px 40px rgba(0,255,65,0.08),inset 0 0 20px rgba(0,0,0,0.5) !important; }
                .void-tab.mode-404 .void-name-tag { background:#001800 !important; color:#00ff41 !important; border-color:rgba(0,255,65,0.5) !important; box-shadow:0 0 8px rgba(0,255,65,0.3) !important; }
                .void-tab.mode-404 .void-text { color:#b8ffcb !important; }
                .void-tab.mode-404 .void-next { color:#00ff41 !important; }
                .void-tab.mode-404 .void-chat-bar { background:rgba(0,8,0,0.92) !important; border-top-color:rgba(0,255,65,0.2) !important; }
                .void-tab.mode-404 .void-input { background:rgba(0,15,0,0.85) !important; color:#00ff41 !important; border-color:rgba(0,255,65,0.3) !important; caret-color:#00ff41; }
                .void-tab.mode-404 .void-input::placeholder { color:rgba(0,255,65,0.35) !important; }
                .void-tab.mode-404 .void-send-btn { background:#001a00 !important; color:#00ff41 !important; border:1px solid rgba(0,255,65,0.4) !important; }
                .void-tab.mode-404 .void-send-btn:hover { background:#003300 !important; box-shadow:0 0 10px rgba(0,255,65,0.3) !important; }
                .void-tab.mode-404 .void-retry-btn { background:#002200 !important; color:#00ff41 !important; border:1px solid rgba(0,255,65,0.5) !important; }
                .void-tab.mode-404 .void-retry-btn:hover { background:#003300 !important; box-shadow:0 0 10px rgba(0,255,65,0.4) !important; }
                .void-tab.mode-404 #home-chat-title { color:#00ff41 !important; }
                .void-tab.mode-404 .void-btn { background:rgba(0,20,0,0.7) !important; border-color:rgba(0,255,65,0.3) !important; color:#00ff41 !important; }
                .void-tab.mode-404 .void-app-icon { background:rgba(0,15,0,0.7) !important; border-color:rgba(0,255,65,0.25) !important; }
                .void-tab.mode-404 .void-app-icon-label { color:#00cc33 !important; }
                .void-tab.mode-404 .void-bubble { background:rgba(0,10,0,0.88) !important; border:1px solid rgba(0,255,65,0.35) !important; box-shadow:0 4px 16px rgba(0,255,65,0.1) !important; }
                .void-tab.mode-404 .void-bubble-text { color:#b8ffcb !important; }
                .void-tab.mode-404 .void-bubble-tag { background:rgba(0,255,65,0.1) !important; color:#00ff41 !important; border-color:rgba(0,255,65,0.3) !important; }
                .void-tab.mode-404 #lobby-prompts-btn { border-color:rgba(0,255,65,0.25) !important; color:#00cc33 !important; }
                .void-tab.mode-404 .void-sys-dropdown { background:rgba(0,10,0,0.97) !important; border-color:rgba(0,255,65,0.25) !important; box-shadow:0 6px 20px rgba(0,255,65,0.08) !important; }
                .void-tab.mode-404 .void-sys-dropdown-item { color:rgba(0,200,50,0.8) !important; border-bottom-color:rgba(0,255,65,0.1) !important; }
                .void-tab.mode-404 .void-sys-dropdown-item:hover { background:rgba(0,255,65,0.08) !important; color:#00ff41 !important; }
                .void-tab.mode-404 .void-hist-btn { border-color:rgba(0,255,65,0.18); color:rgba(0,204,51,0.6); }
                .void-tab.mode-404 .void-hist-btn:hover { background:rgba(0,255,65,0.08); color:#00cc33; }
                .void-tab.mode-404 #iris-history-overlay { background:rgba(0,6,0,0.97); }
                .void-tab.mode-404 .hist-title { color:#a8ffca; }
                .void-tab.mode-404 .hist-item-check { accent-color:#00cc33; }
                .void-tab.mode-404 .hist-check-all-label input { accent-color:#00cc33; }
                .void-tab.mode-404 .hist-role-badge.user { background:rgba(0,255,65,0.08); color:rgba(0,200,50,0.9); }
                .void-tab.mode-404 .hist-icon-btn.edit:hover { color:#00cc33; }
                .void-tab.mode-404 .hist-edit-confirm-btn { background:rgba(0,255,65,0.1); border-color:rgba(0,255,65,0.3); color:#00cc33; }
                .void-tab.mode-404 .void-panel-overlay { background:rgba(0,10,0,0.88) !important; border-color:rgba(0,255,65,0.35) !important; box-shadow:0 8px 32px rgba(0,255,65,0.08) !important; }
                .void-tab.mode-404 .void-panel-header { background:rgba(0,15,0,0.6) !important; border-bottom-color:rgba(0,255,65,0.2) !important; }
                .void-tab.mode-404 .void-panel-title { color:#00ff41 !important; }
                .void-tab.mode-404 .void-panel-close { color:#00cc33 !important; }
                .void-tab.mode-404 .void-panel-item { background:rgba(0,15,0,0.7) !important; border-color:rgba(0,255,65,0.2) !important; }
                .void-tab.mode-404 .void-panel-item-name { color:#b8ffcb !important; }
                .void-tab.mode-404 .void-panel-item-tag { color:rgba(0,255,65,0.5) !important; }
                .void-tab.mode-404 .void-panel-item-stat { color:#00ff41 !important; }
                .void-tab.mode-404 .void-panel-item-rank { color:rgba(0,255,65,0.4) !important; }
                .void-tab.mode-404 .void-panel-detail-body { color:#b8ffcb !important; }
                .void-tab.mode-404 .void-panel-detail-name { color:#00ff41 !important; }
                .void-tab.mode-404 .void-panel-back { background:rgba(0,25,0,0.5) !important; color:#00cc33 !important; }
                /* 掃描線 */
                .void-tab.mode-404::after { content:''; position:absolute; inset:0; pointer-events:none; z-index:100; background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.025) 2px,rgba(0,255,65,0.025) 4px); }
            `;
            document.head.appendChild(style);
        }
    };

    // ========================
    // 5. 導出與啟動
    // ========================
    window.AureliaUIUtils = {
        init: () => {
            IconManager.init();
            MessageCollapser.init();
            LayoutManager.init(); // 🔥 啟動佈局管理器
            console.log('✅ UI 工具箱 (Lite) 已啟動 (包含動態島避讓支援)');
        },
        reinitializeCollapse: () => MessageCollapser.init()
    };

    // 樣式工具箱：供所有模組使用相同的大廳/404 CSS 類別
    window.AureliaVoidStyles = {
        inject: (bgUrl) => VoidStyles.inject(bgUrl)
    };

})();