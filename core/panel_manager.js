/**
 * ========================
 * Aurelia Panel Manager (Nuclear Fix)
 * 面板管理器 - 核彈級修復版
 * ========================
 * * V3.0.6 改動：
 * 1. 徹底重寫 DragManager，解決滑鼠監聽器殘留導致的卡頓。
 * 2. 關閉面板時，立即切斷 iframe 連結，不等待動畫結束。
 * 3. 強制垃圾回收機制。
 */

(function() {
    'use strict';

    // ========================
    // 配置
    // ========================
    const PANEL_CONFIG = {
        TYPES: {
            VN: { id: 'vn-panel', name: 'VN面板', icon: '📖' } // 🔥 不再使用 iframe，改由 VN_PLAYER.launchApp 注入
        },
        BASE_PATH: './scripts/extensions/third-party/my-tavern-extension/panels/',
        Z_INDEX: 99999
    };

    // ========================
    // 狀態管理
    // ========================
    const PanelState = {
        activePanels: {}, // 存儲: { type: { element, cleanup } }
        
        add(type, element, cleanupFunc) {
            this.activePanels[type] = { element, cleanup: cleanupFunc };
        },
        
        get(type) { return this.activePanels[type]; },
        
        remove(type) {
            if (this.activePanels[type]) {
                delete this.activePanels[type];
            }
        },
        
        getAllTypes() { return Object.keys(this.activePanels); }
    };

    // ========================
    // 拖曳核心 (解決卡頓的關鍵)
    // ========================
    // 將事件處理函數移到外部，確保引用一致，能被正確移除
    let dragTarget = null;
    let dragOffset = { x: 0, y: 0 };

    function globalMouseMove(e) {
        if (!dragTarget) return;
        
        e.preventDefault(); // 防止選中文字導致卡頓
        
        // 使用 requestAnimationFrame 優化渲染性能
        requestAnimationFrame(() => {
            if (!dragTarget) return;
            dragTarget.style.left = (e.clientX - dragOffset.x) + 'px';
            dragTarget.style.top = (e.clientY - dragOffset.y) + 'px';
            dragTarget.style.transform = 'none'; // 拖曳時移除 transform 以免座標衝突
        });
    }

    function globalMouseUp() {
        if (dragTarget) {
            // 拖曳結束
            dragTarget.style.opacity = '1';
            dragTarget = null;
            // 移除全局監聽 (這一步非常重要，釋放資源)
            document.removeEventListener('mousemove', globalMouseMove);
            document.removeEventListener('mouseup', globalMouseUp);
            document.body.style.userSelect = '';
        }
    }

    // ========================
    // 面板創建邏輯
    // ========================
    const PanelManager = {
        
        createPanel(type) {
            const config = PANEL_CONFIG.TYPES[type];
            if (!config) return null;

            // 1. 如果已存在，先強制銷毀舊的
            this.destroyPanel(type);

            // 2. 創建 DOM
            const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;
            
            const panel = document.createElement('div');
            panel.id = config.id;
            
            // 基礎樣式
            const style = {
                position: 'fixed',
                display: 'flex', flexDirection: 'column',
                backgroundColor: '#1a1a1a', 
                border: '1px solid #333',
                zIndex: PANEL_CONFIG.Z_INDEX,
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                overflow: 'hidden',
                transition: 'opacity 0.2s ease' // 只做透明度動畫，減少重繪
            };

            if (isMobile) {
                // 手機版：全螢幕
                Object.assign(style, { top: '0', left: '0', width: '100vw', height: '100dvh' });
            } else {
                // 電腦版：居中
                Object.assign(style, {
                    top: '50%', left: '50%', 
                    width: '900px', height: '80vh',
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '12px'
                });
            }
            
            Object.assign(panel.style, style);

            // 3. 標題欄 (拖曳手把)
            const header = document.createElement('div');
            header.style.cssText = `
                height: 40px; background: #222; border-bottom: 1px solid #444;
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 15px; cursor: move; user-select: none; color: #eee;
            `;
            header.innerHTML = `
                <div>${config.icon} ${config.name}</div>
                <div class="close-btn" style="cursor: pointer; padding: 5px;">✕</div>
            `;
            panel.appendChild(header);

            // 4. 內容區
            const content = document.createElement('div');
            content.style.cssText = `flex: 1; background: #000; position: relative; overflow: hidden;`;

            // 🔥 VN 類型：不使用 iframe，直接在主頁面環境注入 HTML
            let iframe = null;
            if (type === 'VN') {
                const vnDiv = document.createElement('div');
                vnDiv.style.cssText = `width: 100%; height: 100%; overflow: hidden; position: relative;`;
                content.appendChild(vnDiv);
                if (window.VN_PLAYER && window.VN_PLAYER.launchApp) {
                    window.VN_PLAYER.launchApp(vnDiv);
                }
            } else {
                iframe = document.createElement('iframe');
                iframe.src = PANEL_CONFIG.BASE_PATH + config.path;
                iframe.style.cssText = `width: 100%; height: 100%; border: none; display: block;`;
                content.appendChild(iframe);
            }
            panel.appendChild(content);

            document.body.appendChild(panel);

            // 5. 綁定事件
            
            // 關閉按鈕
            header.querySelector('.close-btn').onclick = () => this.destroyPanel(type);

            // 拖曳啟動 (僅限電腦)
            if (!isMobile) {
                header.onmousedown = (e) => {
                    if (e.target.classList.contains('close-btn')) return;
                    
                    dragTarget = panel;
                    const rect = panel.getBoundingClientRect();
                    dragOffset.x = e.clientX - rect.left;
                    dragOffset.y = e.clientY - rect.top;
                    
                    panel.style.opacity = '0.9';
                    document.body.style.userSelect = 'none';
                    
                    // 只有按下時才監聽移動，放開就移除 -> 極致省資源
                    document.addEventListener('mousemove', globalMouseMove);
                    document.addEventListener('mouseup', globalMouseUp);
                };
            }

            // 6. 註冊清理函數 (確保銷毀時乾乾淨淨)
            const cleanup = () => {
                // 移除事件
                header.onmousedown = null;
                header.querySelector('.close-btn').onclick = null;

                // 如果正在拖曳這個面板，強制停止
                if (dragTarget === panel) {
                    globalMouseUp();
                }

                // 清理資源
                if (iframe) {
                    // 非 VN 類型：斷開 iframe
                    iframe.src = 'about:blank';
                    try { iframe.contentWindow.document.write(''); } catch(e){}
                } else if (type === 'VN' && window.VN_Core) {
                    // VN 類型：停止計時器，重置狀態
                    window.VN_Core.clearTimers();
                }

                // 移除 DOM
                panel.remove();
                console.log(`[Panel] ${type} 已徹底銷毀`);
            };

            PanelState.add(type, panel, cleanup);
            return panel;
        },

        // 顯示面板
        showPanel(type) {
            let state = PanelState.get(type);
            if (!state) {
                this.createPanel(type);
            }
            // 確保只有一個面板是開著的 (減少資源消耗)
            const others = PanelState.getAllTypes().filter(t => t !== type);
            others.forEach(t => this.destroyPanel(t));
        },

        // 隱藏 (直接銷毀)
        hidePanel(type) {
            this.destroyPanel(type);
        },

        // 銷毀面板 (核心函數)
        destroyPanel(type) {
            const state = PanelState.get(type);
            if (state) {
                // 執行註冊的清理函數
                state.cleanup();
                PanelState.remove(type);
            }
        },

        // 切換
        togglePanel(type) {
            const state = PanelState.get(type);
            if (state) {
                this.destroyPanel(type);
            } else {
                this.showPanel(type);
            }
        },
        
        // 狀態查詢
        isPanelVisible(type) {
            return !!PanelState.get(type);
        }
    };

    // ========================
    // API 導出
    // ========================
    window.AureliaPanelManager = {
        showPanel: (t) => PanelManager.showPanel(t),
        hidePanel: (t) => PanelManager.destroyPanel(t),
        togglePanel: (t) => PanelManager.togglePanel(t),
        isPanelVisible: (t) => PanelManager.isPanelVisible(t),
        // 兼容舊接口
        createPanel: (t) => PanelManager.createPanel(t),
        hideAllPanels: () => {}, 
        init: () => console.log('✅ 面板管理器 (核彈級修復版) 就緒')
    };

    window.AureliaPanelManager.init();

})();