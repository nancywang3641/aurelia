/**
 * ========================
 * Aurelia UI Utilities (Lite)
 * UI 工具箱 - 負責圖標定位與訊息折疊 (瀅瀅書咖色票版)
 * 版本：3.0.0-lite (CSS 已抽離)
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
    // 3. 純白大廳背景圖動態設定 (CSS已移至 aurelia_core.css)
    // ========================
    const VoidStyles = {
        inject(bgUrl) {
            // 僅保留更新背景 CSS 變數的功能，不需再生成大坨的 <style>
            if (bgUrl) {
                document.documentElement.style.setProperty('--void-bg-url', `url(${bgUrl})`);
            }
        }
    };

    // ========================
    // 4. 導出與啟動
    // ========================
    window.AureliaUIUtils = {
        init: () => {
            IconManager.init();
            MessageCollapser.init();
            console.log('✅ UI 工具箱已啟動 (CSS已成功抽離至 aurelia_core.css)');
        },
        reinitializeCollapse: () => MessageCollapser.init()
    };

    // 樣式工具箱：供所有模組使用相同的大廳背景更新邏輯
    window.AureliaVoidStyles = {
        inject: (bgUrl) => VoidStyles.inject(bgUrl)
    };

})();