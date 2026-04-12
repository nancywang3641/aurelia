/**
 * ========================
 * Aurelia UI Utilities (Lite)
 * UI 工具箱 - 負責圖標定位與訊息折疊 (瀅瀅書咖色票版)
 * 版本：3.0.0-lite
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
    // 3. 純白大廳 / 404 號房 全域樣式 (瀅瀅書咖色票覆蓋)
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
                .void-tab { width:100%; height:100%; display:flex; flex-direction:column; position:relative; overflow:hidden; background:#452216; font-family:'Noto Sans TC',sans-serif; }
                .void-bg { position:absolute; inset:0; z-index:0; pointer-events:none; background-color:#452216; background-image:var(--void-bg-url,none); background-size:cover; background-position:center; opacity:0.8; }
                .void-grid { position:absolute; inset:0; z-index:1; pointer-events:none; background-image:linear-gradient(rgba(251,223,162,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(251,223,162,0.05) 1px,transparent 1px); background-size:30px 30px; opacity:0.8; }

                /* ===== 頂欄 ===== */
                .void-top-bar { position:absolute; top:0; left:0; right:0; z-index:16; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; background:rgba(69,34,22,0.85); color:#FBDFA2; border-bottom:1px solid rgba(251,223,162,0.2); }

                /* ===== 系統工具下拉選單 ===== */
                #lobby-sys-menu { position:relative; flex-shrink:0; }
                #lobby-prompts-btn { background:none; border:1px solid rgba(251,223,162,0.4); border-radius:7px; cursor:pointer; font-size:13px; padding:5px 8px; line-height:1; opacity:0.8; transition:all 0.2s; color:#FBDFA2; display:flex; align-items:center; gap:5px; }
                #lobby-prompts-btn span { font-size:9px; font-weight:600; letter-spacing:0.5px; }
                #lobby-prompts-btn:hover, #lobby-prompts-btn.open { opacity:1; border-color:#FBDFA2; background:rgba(251,223,162,0.1); }
                .void-sys-dropdown { position:absolute; top:calc(100% + 5px); left:0; background:rgba(120,55,25,0.98); backdrop-filter:blur(14px); border:1px solid rgba(251,223,162,0.3); border-radius:9px; box-shadow:0 6px 20px rgba(0,0,0,0.5); min-width:130px; z-index:30; overflow:hidden; animation:dropIn 0.15s ease; }
                @keyframes dropIn { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
                .void-sys-dropdown-item { display:flex; align-items:center; gap:9px; padding:10px 14px; font-size:12px; color:#FFF8E7; cursor:pointer; transition:background 0.13s; border-bottom:1px solid rgba(255,255,255,0.05); }
                .void-sys-dropdown-item:last-child { border-bottom:none; }
                .void-sys-dropdown-item:hover { background:rgba(251,223,162,0.15); color:#FBDFA2; }
                .void-sys-dropdown-item i { font-size:11px; width:13px; text-align:center; opacity:0.8; }

                /* ===== 立繪 ===== */
                .void-char-area { position:absolute; bottom:80px; left:50%; transform:translateX(-50%); z-index:5; width:100%; max-width:640px; height:78%; display:flex; justify-content:center; align-items:flex-end; }
                .void-char-img { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; filter:drop-shadow(0 12px 28px rgba(0,0,0,0.3)); transition:transform 0.3s ease, opacity 0.35s ease; }

                /* ===== 對話框 ===== */
                .void-dialogue-wrap { position:absolute; bottom:90px; left:0; right:0; z-index:10; padding:10px 15px; }
                .void-dialogue-box { background:rgba(120,55,25,0.9); backdrop-filter:blur(25px); -webkit-backdrop-filter:blur(25px); border:1px solid rgba(251,223,162,0.4); border-radius:4px; padding:15px 20px; box-shadow:0 10px 40px rgba(0,0,0,0.4); position:relative; cursor:pointer; min-height:60px; }
                .void-name-tag { position:absolute; top:-14px; left:20px; background:#FBDFA2; color:#452216; padding:4px 18px; font-weight:bold; font-size:11px; box-shadow:2px 2px 5px rgba(0,0,0,0.3); letter-spacing:1px; transform:skewX(-15deg); border:1px solid #FBDFA2; }
                .void-name-tag > span { display:block; transform:skewX(15deg); }
                .void-text { font-size:13px; color:#FFF8E7; line-height:1.7; font-weight:500; }
                @keyframes void-blink { 0%,100%{opacity:1} 50%{opacity:0} }
                .void-next { position:absolute; bottom:8px; right:15px; font-size:12px; color:#FBDFA2; animation:void-blink 1.2s infinite; display:none; }

                /* ===== 輸入欄 ===== */
                .void-chat-bar { position:absolute; bottom:0; left:0; right:0; z-index:15; height:auto; background:rgba(69,34,22,0.9); backdrop-filter:blur(10px); border-top:1px solid rgba(251,223,162,0.3); display:flex; flex-direction:column; padding:6px 12px; gap:5px; }
                .void-chat-btns { display:flex; gap:6px; align-items:center; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; }
                .void-chat-btns::-webkit-scrollbar { display:none; }
                .void-chat-input-row { display:flex; gap:8px; align-items:center; }
                .void-input { flex:1; background:rgba(120,55,25,0.8); border:1px solid rgba(251,223,162,0.3); color:#FFF8E7; padding:10px 16px; border-radius:2px; font-size:13px; outline:none; transition:0.2s; transform:skewX(-5deg); }
                .void-input:focus { background:#452216; border-color:#FBDFA2; box-shadow:0 0 0 2px rgba(251,223,162,0.2); }
                .void-send-btn { width:36px; height:36px; background:linear-gradient(135deg, #FBDFA2, #B78456); border-radius:2px; border:none; color:#452216; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:2px 2px 5px rgba(0,0,0,0.3); transition:0.2s; transform:skewX(-10deg); }
                .void-send-btn > i { transform:skewX(10deg); }
                .void-send-btn:hover { filter:brightness(1.1); box-shadow:0 0 15px rgba(251,223,162,0.4); }
                .void-send-btn:active { transform:skewX(-10deg) translateY(2px); }
                .void-retry-btn { display:none; width:36px; height:36px; background:transparent; border-radius:2px; border:1px solid #FBDFA2; color:#FBDFA2; cursor:pointer; align-items:center; justify-content:center; font-size:15px; transition:0.2s; transform:skewX(-10deg); flex-shrink:0; }
                .void-retry-btn.visible { display:flex; }
                .void-retry-btn > i { transform:skewX(10deg); }
                .void-retry-btn:hover { background:rgba(251,223,162,0.1); box-shadow:0 0 8px rgba(251,223,162,0.3); }
                .void-retry-btn:active { transform:skewX(-10deg) translateY(2px); }

                /* ===== 歷史按鈕 ===== */
                .void-hist-btn { flex-shrink:0; background:rgba(120,55,25,0.6); border:1px solid rgba(251,223,162,0.2); border-radius:7px; padding:3px 6px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px; color:#FBDFA2; transition:all 0.2s; line-height:1; }
                .void-hist-btn i { font-size:10px; }
                .void-hist-btn span { font-size:8px; white-space:nowrap; }
                .void-hist-btn:hover { background:rgba(251,223,162,0.15); color:#FBDFA2; border-color:#FBDFA2; }

                /* ===== 世界頻道泡泡 (聊天欄模式) ===== */
                .void-bubble-layer { position:absolute; right:8px; top:56px; bottom:100px; width:162px; z-index:8; pointer-events:none; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end; align-items:flex-end; gap:5px; background:transparent; }
                .void-bubble { position:relative; width:100%; max-width:162px; background:rgba(69,34,22,0.9); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(251,223,162,0.3); border-radius:16px; padding:8px 11px; box-shadow:0 6px 24px rgba(0,0,0,0.4),0 2px 6px rgba(0,0,0,0.2); opacity:0; animation:bubblePop 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards; flex-shrink:0; box-sizing:border-box; color:#FFF8E7; }
                @keyframes bubblePop { 0%{opacity:0;transform:scale(0.1)} 65%{opacity:1;transform:scale(1.07)} 100%{opacity:1;transform:scale(1)} }
                @keyframes bubbleFadeOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.88) translateY(-6px)} }
                .void-bubble-tag { display:inline-block; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--bc,#FBDFA2); font-family:'Courier New',monospace; background:rgba(var(--bc-rgb,251,223,162),0.1); padding:1px 6px; border-radius:20px; margin-bottom:5px; }
                .void-bubble-text { font-size:11px; color:#FFF8E7; line-height:1.45; font-weight:500; }
                @media (max-width:680px) { .void-bubble-layer { display:none; } }

                /* ===== 斜角按鈕 ===== */
                .void-btn-wrap { display:flex; gap:8px; }
                .void-btn { padding:6px 16px; background:rgba(120,55,25,0.9); border:1px solid rgba(251,223,162,0.4); cursor:pointer; color:#FBDFA2; font-size:11px; font-weight:800; backdrop-filter:blur(5px); box-shadow:2px 2px 10px rgba(0,0,0,0.3); transition:all 0.25s cubic-bezier(0.2,0.8,0.2,1); transform:skewX(-15deg); border-radius:2px; position:relative; overflow:hidden; }
                .void-btn::before { content:''; position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg,transparent,rgba(251,223,162,0.2),transparent); transform:skewX(-20deg); transition:0s; }
                .void-btn:hover::before { left:200%; transition:0.6s ease-in-out; }
                .void-btn:hover { background:rgba(251,223,162,0.1); border-color:#FBDFA2; color:#FBDFA2; transform:skewX(-15deg) translateY(-2px); box-shadow:0 5px 15px rgba(251,223,162,0.25); }
                .void-btn-inner { transform:skewX(15deg); display:flex; align-items:center; gap:6px; letter-spacing:0.5px; }

                /* ===== APP 快速啟動列 ===== */
                .void-app-tray { position:absolute; top:56px; left:0; right:0; z-index:9; display:flex; gap:7px; padding:8px 12px; overflow-x:auto; overflow-y:visible; scrollbar-width:none; }
                .void-app-tray::-webkit-scrollbar { display:none; }
                .void-app-icon { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:50px; cursor:pointer; padding:7px 5px; flex-shrink:0; background:rgba(120,55,25,0.8); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border:1px solid rgba(251,223,162,0.3); border-radius:13px; box-shadow:0 3px 10px rgba(0,0,0,0.3); transition:all 0.2s cubic-bezier(0.2,0.8,0.2,1); -webkit-tap-highlight-color:transparent; }
                .void-app-icon:hover { background:rgba(120,55,25,0.95); border-color:#FBDFA2; transform:translateY(-3px); box-shadow:0 6px 16px rgba(251,223,162,0.2); }
                .void-app-icon:active { transform:translateY(0px); box-shadow:0 2px 6px rgba(0,0,0,0.4); }
                .void-app-icon-emoji { font-size:19px; line-height:1; }
                .void-app-icon-label { font-size:8px; font-weight:800; color:#FBDFA2; letter-spacing:0.3px; white-space:nowrap; font-family:'Noto Sans TC',sans-serif; }

                /* ===== ERR_404 崩潰動畫 ===== */
                @keyframes glitchCrash { 0%{filter:none;transform:none} 12%{filter:hue-rotate(90deg) saturate(8) brightness(1.5);transform:skewX(6deg) scaleY(1.02)} 24%{filter:invert(1) brightness(2);transform:skewX(-4deg) translateY(-3px)} 36%{filter:brightness(0.1);transform:scaleX(1.03) skewX(2deg)} 50%{filter:invert(1) hue-rotate(180deg) saturate(12);transform:skewX(-6deg) scaleY(0.98)} 65%{filter:brightness(5) contrast(10);transform:none} 80%{filter:brightness(0);transform:none} 100%{filter:none;transform:none} }
                .void-tab.glitch-crash { animation:glitchCrash 0.55s steps(3) forwards; pointer-events:none; }

                /* ===== 資料面板 ===== */
                .void-panel-overlay { position:absolute; top:90px; bottom:142px; left:12px; right:12px; z-index:9; background:rgba(120,55,25,0.95); backdrop-filter:blur(28px); -webkit-backdrop-filter:blur(28px); border:1px solid rgba(251,223,162,0.4); border-radius:4px; box-shadow:0 8px 32px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden; animation:panelSlideIn 0.28s cubic-bezier(0.2,0.8,0.2,1) forwards; }
                @keyframes panelSlideIn { from{opacity:0;transform:translateY(12px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                .void-panel-header { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; flex-shrink:0; border-bottom:1px solid rgba(251,223,162,0.3); background:rgba(69,34,22,0.6); }
                .void-panel-title { font-size:10px; font-weight:800; color:#FBDFA2; letter-spacing:2px; text-transform:uppercase; font-family:'Courier New',monospace; }
                .void-panel-close { background:none; border:none; cursor:pointer; font-size:13px; color:#B78456; padding:2px 6px; border-radius:2px; transition:0.2s; line-height:1; }
                .void-panel-close:hover { color:#FBDFA2; background:rgba(251,223,162,0.1); }
                .void-panel-body { flex:1; overflow-y:auto; padding:6px 8px; scrollbar-width:thin; scrollbar-color:rgba(251,223,162,0.5) transparent; }
                .void-panel-list { display:flex; flex-direction:column; gap:5px; }
                .void-panel-item { display:flex; align-items:center; gap:10px; padding:9px 12px; background:rgba(120,55,25,0.8); border:1px solid rgba(251,223,162,0.2); border-radius:3px; cursor:pointer; transform:skewX(-4deg); transition:all 0.18s cubic-bezier(0.2,0.8,0.2,1); }
                .void-panel-item:hover { background:rgba(183,132,86,1); border-color:#FBDFA2; transform:skewX(-4deg) translateX(4px); box-shadow:0 3px 12px rgba(251,223,162,0.15); }
                .void-panel-item-rank { font-size:9px; font-weight:900; color:#B78456; font-family:'Courier New',monospace; transform:skewX(4deg); min-width:16px; }
                .void-panel-item-main { flex:1; transform:skewX(4deg); min-width:0; }
                .void-panel-item-name { display:block; font-size:12px; font-weight:700; color:#FFF8E7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .void-panel-item-tag { display:inline-block; font-size:9px; color:#FBDFA2; margin-top:1px; letter-spacing:0.5px; background:rgba(251,223,162,0.1); padding:2px 6px; border-radius:4px; }
                .void-panel-item-stat { font-size:11px; font-weight:700; color:#B78456; transform:skewX(4deg); white-space:nowrap; }
                .void-panel-item-arrow { font-size:16px; color:#B78456; transform:skewX(4deg); line-height:1; }
                .void-panel-detail { flex-direction:column; gap:8px; }
                .void-panel-detail-header { display:flex; align-items:center; gap:10px; padding-bottom:8px; border-bottom:1px solid rgba(251,223,162,0.2); }
                .void-panel-back { background:rgba(251,223,162,0.1); border:1px solid rgba(251,223,162,0.3); cursor:pointer; font-size:11px; color:#FBDFA2; padding:4px 10px; border-radius:2px; transform:skewX(-8deg); transition:0.2s; white-space:nowrap; }
                .void-panel-back:hover { background:rgba(251,223,162,0.2); color:#FFF8E7; }
                .void-panel-detail-name { font-size:12px; font-weight:800; color:#FFF8E7; letter-spacing:0.5px; }
                .void-panel-detail-body { font-size:12px; color:#E0D8C8; line-height:1.75; font-weight:500; }

                /* ===== 歷史對話面板 ===== */
                #iris-history-overlay { position:absolute; inset:0; z-index:20; background:rgba(69,34,22,0.95); display:flex; flex-direction:column; animation:histIn 0.22s ease; }
                @keyframes histIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
                .hist-header { display:flex; align-items:center; justify-content:space-between; padding:11px 14px 9px; border-bottom:1px solid rgba(251,223,162,0.3); flex-shrink:0; }
                .hist-title { font-size:12px; font-weight:700; color:#FBDFA2; letter-spacing:1.5px; text-transform:uppercase; }
                .hist-char-badge { font-size:9px; padding:2px 7px; border-radius:10px; margin-left:8px; font-weight:600; letter-spacing:0.3px; }
                .hist-char-badge.iris { background:rgba(251,223,162,0.2); color:#FBDFA2; border:1px solid #FBDFA2; }
                .hist-char-badge.cheshire { background:rgba(0,255,65,0.12); color:#00cc33; border:1px solid rgba(0,255,65,0.28); }
                .hist-close { background:none; border:none; color:#FBDFA2; font-size:15px; cursor:pointer; padding:2px 6px; transition:color 0.18s; line-height:1; }
                .hist-close:hover { color:#FFF8E7; }
                .hist-toolbar { display:flex; align-items:center; gap:6px; padding:7px 12px; border-bottom:1px solid rgba(251,223,162,0.1); background:rgba(0,0,0,0.5); flex-shrink:0; flex-wrap:wrap; }
                .hist-check-all-label { display:flex; align-items:center; gap:4px; font-size:10px; color:#FFF8E7; cursor:pointer; user-select:none; margin-right:2px; }
                .hist-check-all-label input { accent-color:#B78456; cursor:pointer; width:13px; height:13px; }
                .hist-count { font-size:10px; color:#B78456; margin-left:auto; font-family:monospace; }
                .hist-action-btn { background:rgba(120,55,25,0.6); border:1px solid rgba(251,223,162,0.2); border-radius:5px; padding:4px 9px; font-size:10px; color:#FBDFA2; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
                .hist-action-btn:hover:not(:disabled) { background:rgba(251,223,162,0.1); color:#FFF8E7; }
                .hist-action-btn:disabled { opacity:0.28; cursor:default; }
                .hist-action-btn.danger { color:#fc8181; border-color:#fc8181; background:rgba(252,129,129,0.1); }
                .hist-action-btn.danger:hover:not(:disabled) { background:rgba(252,129,129,0.2); color:#ff7070; }
                .hist-list { flex:1; overflow-y:auto; padding:6px 8px; }
                .hist-list::-webkit-scrollbar { width:3px; }
                .hist-list::-webkit-scrollbar-thumb { background:rgba(251,223,162,0.3); border-radius:2px; }
                .hist-empty { text-align:center; color:#B78456; font-size:12px; padding:40px 20px; letter-spacing:1px; }
                .hist-item { display:flex; align-items:flex-start; gap:7px; padding:7px 9px; border-radius:5px; margin-bottom:3px; border:1px solid transparent; transition:background 0.15s; }
                .hist-item:hover { background:rgba(251,223,162,0.05); }
                .hist-item.selected { background:rgba(251,223,162,0.1); border-color:rgba(251,223,162,0.2); }
                .hist-item-check { flex-shrink:0; margin-top:3px; cursor:pointer; accent-color:#B78456; width:13px; height:13px; }
                .hist-role-badge { flex-shrink:0; font-size:8px; font-weight:700; padding:2px 5px; border-radius:3px; margin-top:2px; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; }
                .hist-role-badge.user { background:rgba(251,223,162,0.2); color:#FBDFA2; border:1px solid #FBDFA2; }
                .hist-role-badge.ai { background:rgba(226,232,240,0.1); color:#FFF8E7; border:1px solid #FFF8E7; }
                .hist-role-badge.ai.cheshire { background:rgba(0,255,65,0.10); color:#00cc33; border:1px solid rgba(0,255,65,0.3); }
                .hist-item-body { flex:1; min-width:0; }
                .hist-item-text { font-size:11px; color:#E0D8C8; line-height:1.55; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; white-space:pre-wrap; cursor:pointer; transition:color 0.15s; }
                .hist-item-text.expanded { display:block; -webkit-line-clamp:unset; }
                .hist-item-text:hover { color:#FFF8E7; }
                .hist-item-actions { display:flex; gap:3px; flex-shrink:0; margin-top:1px; }
                .hist-icon-btn { background:none; border:none; color:#B78456; font-size:12px; cursor:pointer; padding:2px 4px; border-radius:3px; line-height:1; transition:all 0.15s; }
                .hist-icon-btn:hover { background:rgba(251,223,162,0.1); color:#FBDFA2; }
                .hist-icon-btn.edit:hover { color:#FBDFA2; }
                .hist-icon-btn.rollback:hover { color:#FBDFA2; }
                .hist-item-edit-area { width:100%; background:rgba(120,55,25,0.9); border:1px solid #FBDFA2; border-radius:4px; color:#FFF8E7; font-size:11px; padding:5px 7px; font-family:monospace; line-height:1.5; resize:vertical; min-height:56px; box-sizing:border-box; }
                .hist-edit-confirm-row { display:flex; gap:5px; margin-top:5px; }
                .hist-edit-confirm-btn { background:#FBDFA2; border:none; border-radius:4px; color:#452216; font-size:10px; padding:3px 9px; cursor:pointer; }
                .hist-edit-cancel-btn { background:transparent; border:1px solid rgba(255,255,255,0.1); border-radius:4px; color:#FFF8E7; font-size:10px; padding:3px 9px; cursor:pointer; }

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
    // 4. 導出與啟動
    // ========================
    window.AureliaUIUtils = {
        init: () => {
            IconManager.init();
            MessageCollapser.init();
            console.log('✅ UI 工具箱 (Lite) 已啟動 (瀅瀅書咖色系注入完畢)');
        },
        reinitializeCollapse: () => MessageCollapser.init()
    };

    // 樣式工具箱：供所有模組使用相同的大廳/404 CSS 類別
    window.AureliaVoidStyles = {
        inject: (bgUrl) => VoidStyles.inject(bgUrl)
    };

})();