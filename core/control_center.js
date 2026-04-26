/**
 * ========================
 * Aurelia Control Center (v4.8.3 - Dual Panel Architecture)
 * 控制中心 - 外殼與路由核心 (雙視窗分離版，完美解決 App 遮擋與寫作狀態保留)
 * ========================
 */

(function(AureliaControlCenter) {
    'use strict';

    const CONFIG = {
        MODAL_ID: 'aurelia-phone-modal',
        PHONE_FRAME_ID: 'aurelia-phone-frame',
        PHONE_SCREEN_ID: 'aurelia-phone-screen',
        TAB_CONTAINER_ID: 'aurelia-tab-container',
        BOTTOM_NAV_ID: 'aurelia-bottom-nav',
        Z_INDEX_MODAL: 999,
    };

    let phoneModal = null;
    let phoneFrame = null;
    let isVisible = false;
    let isEmbedded = false;
    let embeddedRoot = null;
    let syncInterval = null;
    let embedObserver = null;
    let syncTargetSelector = '#sheld';
    let _vnWasOpenBeforeTabSwitch = false;

    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || window.innerWidth < 768;
    }

    function syncModalToChat() {
        if (!phoneFrame || !isVisible || isEmbedded) return;
        const chatEl = document.querySelector(syncTargetSelector) || document.querySelector('#sheld') || document.querySelector('#chat');
        if (!chatEl) return;
        const rect = chatEl.getBoundingClientRect();
        phoneFrame.style.position = 'fixed';
        phoneFrame.style.top    = rect.top    + 'px';
        phoneFrame.style.left   = rect.left   + 'px';
        phoneFrame.style.width  = rect.width  + 'px';
        phoneFrame.style.height = rect.height + 'px';
    }

    function startSyncing() {
        if (syncInterval) clearInterval(syncInterval);
        if (isEmbedded) return;
        syncModalToChat();
        syncInterval = setInterval(syncModalToChat, 100);
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => { if (!isEmbedded) syncModalToChat(); });
            ro.observe(document.body);
            const syncEl = document.querySelector(syncTargetSelector) || document.querySelector('#sheld') || document.querySelector('#chat');
            if (syncEl) ro.observe(syncEl);
        }
    }

    function stopSyncing() {
        if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    }

    function createBottomNav(parentDoc) {
        const nav = parentDoc.createElement('div');
        nav.id = CONFIG.BOTTOM_NAV_ID; 
        // 🌟 修復底部黑邊：加上 padding-bottom: env(safe-area-inset-bottom) 與 box-sizing 以適配 iPhone 底部小白條安全區域
        nav.style.cssText = `height: 55px; background: #ffffff; border-top: 1px solid #e0e5ec; display: flex; justify-content: center; align-items: center; gap: 15px; box-shadow: 0 -5px 15px rgba(0,0,0,0.02); flex-shrink: 0; z-index: 200; position: relative; padding-bottom: env(safe-area-inset-bottom); box-sizing: content-box;`;

        const items = [
            { id: 'nav-home',  icon: 'fa-solid fa-cube',     active: true,  title: '大廳' },
            { id: 'nav-user',  icon: 'fa-solid fa-user',     active: false, title: '我' },
            { id: 'nav-write', icon: 'fa-solid fa-pen-nib',  active: false, title: '寫作' },
            { id: 'nav-close', icon: 'fa-solid fa-power-off', isClose: true, title: '關閉' }
        ];

        items.forEach(item => {
            const btn = parentDoc.createElement('div');
            btn.className = 'nav-button';
            
            // 🌟 修復初始高亮：為預設啟用的大廳加上 active 與 active-gold
            if (item.active) {
                btn.classList.add('active');
                btn.classList.add('active-gold');
            }

            btn.dataset.navId = item.id;
            btn.style.cssText = `padding: 8px 16px; cursor: pointer; border-radius: 12px; color: ${item.active ? '#2b6cb0' : '#a0aec0'}; display: flex; align-items: center; gap: 6px; font-family: sans-serif; transition: 0.2s; ${item.active ? 'background:#ebf8ff;' : ''}`;
            btn.innerHTML = `<i class="${item.icon}" style="font-size: 16px;"></i><span style="font-size:12px; font-weight:bold;">${item.title}</span>`;
            
            btn.onclick = () => {
                if (item.isClose) {
                    if (window.AureliaHtmlExtractor && window.AureliaHtmlExtractor.isVisible) window.AureliaHtmlExtractor.hide();
                    AureliaControlCenter.hide();
                } else switchPage(item.id);
            };
            nav.appendChild(btn);
        });
        return nav;
    }

    function switchPage(pageId) {
        const root = isEmbedded ? embeddedRoot : phoneModal;
        if (!root && !isEmbedded) return;
        const container = isEmbedded ? phoneFrame : root;

        // 切離大廳時暫時隱藏 VN panel；回到大廳時自動恢復
        const vnPanel = container.querySelector('#aurelia-vn-panel');
        if (vnPanel) {
            if (pageId !== 'nav-home' && vnPanel.style.display !== 'none') {
                _vnWasOpenBeforeTabSwitch = true;
                vnPanel.style.display = 'none';
            } else if (pageId === 'nav-home' && _vnWasOpenBeforeTabSwitch) {
                _vnWasOpenBeforeTabSwitch = false;
                vnPanel.style.display = 'flex';
            }
        }

        container.querySelectorAll('.nav-button').forEach(btn => {
            if (btn.dataset.navId === 'nav-close') return;
            const active = btn.dataset.navId === pageId;
            
            // 🌟 修復 TAB 狀態卡死：同步切換 active / active-gold 類名，突破 CSS 的 !important 限制
            if (active) {
                btn.classList.add('active');
                btn.classList.add('active-gold');
            } else {
                btn.classList.remove('active');
                btn.classList.remove('active-gold');
            }

            if (btn.style.background !== 'transparent' && btn.style.background.includes('rgba(0, 255, 65')) {
                // 404 mode ignore
            } else {
                btn.style.color = active ? '#2b6cb0' : '#a0aec0';
                btn.style.background = active ? '#ebf8ff' : 'transparent';
            }
        });

        container.querySelectorAll('.aurelia-tab').forEach(tab => tab.style.display = 'none');
        const target = container.querySelector('#' + pageId.replace('nav-', 'aurelia-') + '-tab');
        if (target) target.style.display = 'flex';

        if (pageId === 'nav-home') {
            if (window.VoidTerminal && window.VoidTerminal.resumeLobbyActivity) window.VoidTerminal.resumeLobbyActivity();
        }
        else if (pageId === 'nav-user') {
            if (window.VoidTerminal && window.VoidTerminal.suspendIdle) window.VoidTerminal.suspendIdle();
            const userTab = container.querySelector('#aurelia-user-tab');
            if (userTab && !userTab.dataset.inited) {
                if (window.OS_PERSONA && window.OS_PERSONA.launch) {
                    window.OS_PERSONA.launch(userTab);
                    userTab.dataset.inited = 'true';
                } else {
                    userTab.innerHTML = '<div style=\"padding:20px; text-align:center; color:#e53e3e;\">人設模組 (OS_PERSONA) 未載入</div>';
                }
            }
        }
        else if (pageId === 'nav-write') {
            if (window.VoidTerminal && window.VoidTerminal.suspendIdle) window.VoidTerminal.suspendIdle();
        }

    }

    function showVnPanel(action) {
        const root = isEmbedded ? embeddedRoot : phoneModal;
        if (!root && !isEmbedded) return;
        const container = isEmbedded ? phoneFrame : root;

        const vnPanel = container.querySelector('#aurelia-vn-panel');
        const vnContainer = container.querySelector('#aurelia-vn-app-container');
        if (!vnPanel || !vnContainer) return;

        if (window.VoidTerminal && window.VoidTerminal.suspendIdle) window.VoidTerminal.suspendIdle();

        function _runAction(delay) {
            if (!action) return;
            setTimeout(() => {
                if (action === 'story' && window.StoryExtractor) window.StoryExtractor.show();
                else if (action === 'generate' && window.VN_PLAYER) window.VN_PLAYER.openGeneratePanel();
                else if (action === 'chapter' && window.VN_PLAYER) window.VN_PLAYER.openChapterPanel();
            }, delay);
        }

        vnPanel.style.display = 'flex';

        if (!vnContainer.dataset.vnInited) {
            const hasPendingScript = !!window._pendingAutoScript;
            if (window.VN_PLAYER && window.VN_PLAYER.launchApp) {
                window.VN_PLAYER.launchApp(vnContainer);
                vnContainer.dataset.vnInited = 'true';
                if (!hasPendingScript) _runAction(150);
            } else {
                setTimeout(() => {
                    if (window.VN_PLAYER && window.VN_PLAYER.launchApp) {
                        const stillPending = !!window._pendingAutoScript;
                        window.VN_PLAYER.launchApp(vnContainer);
                        vnContainer.dataset.vnInited = 'true';
                        if (!stillPending) _runAction(150);
                    }
                }, 2000);
            }
        } else {
            _runAction(50);
        }
    }

    function hideVnPanel() {
        const vnPanel = document.getElementById('aurelia-vn-panel');
        if (vnPanel) vnPanel.style.display = 'none';

        const extractorContainer = document.getElementById('aurelia-extractor-container-vn');
        if (extractorContainer) { extractorContainer.style.display = 'none'; extractorContainer.classList.remove('show'); }
        const storyExtractorContainer = document.getElementById('story-extractor-container-vn');
        if (storyExtractorContainer) { storyExtractorContainer.style.display = 'none'; storyExtractorContainer.classList.remove('show'); }
        if (window.AureliaHtmlExtractor?.hide) window.AureliaHtmlExtractor.hide();

        // 強制讓所有 tab 隱藏，只顯示 home tab，並同步底部 nav 高亮
        document.querySelectorAll('.aurelia-tab').forEach(t => { t.style.display = 'none'; });
        const homeTab = document.getElementById('aurelia-home-tab');
        if (homeTab) homeTab.style.display = 'flex';
        document.querySelectorAll('.nav-button').forEach(btn => {
            const isHome = btn.dataset.navId === 'nav-home';
            btn.classList.toggle('active', isHome);
            btn.classList.toggle('active-gold', isHome);
            btn.style.color = isHome ? '#2b6cb0' : '#a0aec0';
            btn.style.background = isHome ? '#ebf8ff' : 'transparent';
        });

        if (window.VoidTerminal && window.VoidTerminal.resumeLobbyActivity) window.VoidTerminal.resumeLobbyActivity();
    }

    function createTabContainer(parentDoc) {
        const container = parentDoc.createElement('div');
        container.id = CONFIG.TAB_CONTAINER_ID;
        container.style.cssText = `flex: 1; position: relative; overflow: hidden; display: flex; background: #fff; flex-direction: column;`;

        let homeTab;
        if (window.VoidTerminal && window.VoidTerminal.createTab) {
            homeTab = window.VoidTerminal.createTab(parentDoc);
        } else {
            homeTab = parentDoc.createElement('div');
            homeTab.id = 'aurelia-home-tab';
            homeTab.className = 'aurelia-tab void-tab';
            homeTab.innerHTML = '<div style=\"color:red; padding:20px;\">[錯誤] Void Terminal 模組未載入。</div>';
        }

        const userTab = parentDoc.createElement('div');
        userTab.id = 'aurelia-user-tab';
        userTab.className = 'aurelia-tab';
        userTab.style.cssText = `width:100%; height:100%; display:none; background:#f8f9fa; position: relative; flex-direction:column; overflow:hidden;`;

        // 🔥 動態判斷：只有獨立模式才渲染提示詞、世界書、變數工坊與創作室
        const isStandalone = !!document.getElementById('aurelia-standalone-root');

        // ── 寫作設置 TAB ──
        const writeTab = parentDoc.createElement('div');
        writeTab.id = 'aurelia-write-tab';
        writeTab.className = 'aurelia-tab write-tab';
        writeTab.style.cssText = `width:100%; height:100%; display:none; position:relative; flex-direction:column; overflow:hidden;`;
        writeTab.innerHTML = `
            <div class="write-tab-content">
                <div class="write-tab-title-block">
                    <div class="write-tab-title">寫作設置</div>
                    <div class="write-tab-subtitle">WRITING · SYSTEM</div>
                </div>
                <div class="write-tab-btns">
                    <button class="write-tab-btn" data-app="設置"><i class="fa-solid fa-gear"></i><span>API 設置</span></button>
                    <button class="write-tab-btn" id="btn-launch-workshop"><i class="fa-solid fa-wand-magic-sparkles"></i><span>VN煉丹</span></button>
                    ${isStandalone ? `
                    <button class="write-tab-btn" data-app="提示詞"><i class="fa-solid fa-sliders"></i><span>提示詞管理</span></button>
                    <button class="write-tab-btn" data-app="worldbook"><i class="fa-solid fa-book-open"></i><span>世界書</span></button>
                    <button class="write-tab-btn" data-app="avs"><i class="fa-solid fa-dice"></i><span>變數工坊</span></button>
                    <button class="write-tab-btn" id="btn-launch-studio"><i class="fa-solid fa-palette"></i><span>靈感創作室</span></button>
                    ` : ''}
                </div>
                <button class="write-tab-logout-btn" id="write-logout-btn">
                    <i class="fa-solid fa-power-off"></i><span>切換帳號 / 佈局</span>
                </button>
            </div>`;
            
        // 🔥 修改這裡：攔截創作室/煉丹爐的點擊事件，避免調用 showOsApp
        writeTab.querySelectorAll('.write-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.id === 'btn-launch-studio') {
                    if (window.OS_STUDIO) window.OS_STUDIO.launch();
                    else alert('靈感創作室模組尚未載入，請確認 index.html 底部有引入 os_studio.js！');
                } else if (btn.id === 'btn-launch-workshop') {
                    // VN煉丹爐：掛在 write-tab 容器內，切 TAB 自動跟著消失
                    if (window.VN_UI_Workshop) window.VN_UI_Workshop.launchInTab(writeTab);
                    else alert('VN標籤煉丹爐模組尚未載入，請確認 index.html 底部有引入 vn_ui_workshop.js！');
                } else if (btn.dataset.app) {
                    if (window.AureliaControlCenter) window.AureliaControlCenter.showOsApp(btn.dataset.app);
                }
            });
        });

        const wLogoutBtn = writeTab.querySelector('#write-logout-btn');
        if (wLogoutBtn) wLogoutBtn.addEventListener('click', () => {
            if (window.VoidTerminal && window.VoidTerminal.logout) window.VoidTerminal.logout();
        });

        // 🌟 雙層架構 1：寫作 TAB 專用的視窗 (只會覆蓋寫作頁面)
        const writePanel = parentDoc.createElement('div');
        writePanel.id = 'write-panel-container';
        writePanel.style.cssText = `position: absolute; top:0; left:0; width:100%; height:100%; background: #1a1a1a; z-index: 50; display: none; flex-direction: column;`;
        writePanel.innerHTML = `<div id="write-iframe-container" style="width:100%; height:100%; background:#000; overflow:hidden; position:relative;"></div>`;
        writeTab.appendChild(writePanel);

        container.appendChild(homeTab);
        container.appendChild(userTab);
        container.appendChild(writeTab);
        return container;
    }

    function createPhoneScreen(parentDoc) {
        const screen = parentDoc.createElement('div');
        screen.id = CONFIG.PHONE_SCREEN_ID;
        screen.style.cssText = `width: 100%; height: 100%; background: #f8f9fa; overflow: hidden; display: flex; flex-direction: column; position: relative;`;
        screen.appendChild(createTabContainer(parentDoc));
        screen.appendChild(createBottomNav(parentDoc));

        // 🌟 雙層架構 2：全螢幕全域視窗 (給遊戲 Apps 使用，覆蓋整個手機)
        const slidePanel = parentDoc.createElement('div');
        slidePanel.id = 'aurelia-panel-container';
        slidePanel.style.cssText = `position: absolute; top:0; left:0; width:100%; height:100%; background: #1a1a1a; z-index: 50; display: none; flex-direction: column;`;
        slidePanel.innerHTML = `<div id=\"aurelia-iframe-container\" style=\"width:100%; height:100%; background:#000; overflow:hidden; position:relative;\"></div>`;
        screen.appendChild(slidePanel);

        // 🌟 VN 專用全螢幕 overlay（從大廳直接彈出，z-index 51 覆蓋其他 overlay）
        const vnPanel = parentDoc.createElement('div');
        vnPanel.id = 'aurelia-vn-panel';
        vnPanel.style.cssText = `position: absolute; top:0; left:0; right:0; bottom:calc(55px + env(safe-area-inset-bottom, 0px)); background:#000; z-index: 51; display: none; flex-direction: column;`;

        const vnAppContainer = parentDoc.createElement('div');
        vnAppContainer.id = 'aurelia-vn-app-container';
        vnAppContainer.style.cssText = 'width:100%; height:100%; overflow:hidden; position:relative;';
        vnPanel.appendChild(vnAppContainer);

        const extractorContainer = parentDoc.createElement('div');
        extractorContainer.id = 'aurelia-extractor-container-vn';
        extractorContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0a0a0a; z-index: 1000; overflow: hidden; display: none; flex-direction: column;`;
        vnPanel.appendChild(extractorContainer);

        const storyExtractorContainer = parentDoc.createElement('div');
        storyExtractorContainer.id = 'story-extractor-container-vn';
        storyExtractorContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0a0a0a; border: 2px solid #d4af37; z-index: 1001; overflow: hidden; display: none; flex-direction: column;`;
        vnPanel.appendChild(storyExtractorContainer);

        screen.appendChild(vnPanel);

        return screen;
    }

    function createPhoneFrame(parentDoc) {
        const frame = parentDoc.createElement('div');
        frame.id = CONFIG.PHONE_FRAME_ID;
        frame.style.cssText = `
            background: #fff; overflow: hidden; box-shadow: 0 0 50px rgba(0,0,0,0.2);
            border: 1px solid #e0e5ec; pointer-events: auto;
            position: fixed; z-index: ${CONFIG.Z_INDEX_MODAL}; display: none;
        `;
        frame.appendChild(createPhoneScreen(parentDoc));
        return frame;
    }

    function createPhoneModal() {
        const parentDoc = document;
        const modal = parentDoc.createElement('div');
        modal.id = CONFIG.MODAL_ID;
        modal.style.cssText = `position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: ${CONFIG.Z_INDEX_MODAL};`;
        phoneFrame = createPhoneFrame(parentDoc);
        modal.appendChild(phoneFrame);
        parentDoc.body.appendChild(modal);
        return modal;
    }

    AureliaControlCenter.mountEmbedded = function(containerEl, placement = 'bottom') {
        if (!phoneModal) phoneModal = createPhoneModal();
        stopSyncing();
        isEmbedded = true;
        
        const isMobile = isMobileDevice();
        // 🌟 判斷當前是否處於獨立全螢幕模式 (index.html)
        const isStandalone = containerEl && containerEl.id === 'aurelia-standalone-root';

        if (!embeddedRoot) {
            embeddedRoot = document.createElement('div');
            embeddedRoot.id = 'aurelia-embedded-root';
            
            // 獨立全螢幕模式：height: 100% 繼承父元素
            if (isStandalone) {
                embeddedRoot.style.cssText = `
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    width: 100%; z-index: 100; overflow: hidden;
                `;
            } else if (isMobile) {
                // 🌟 改用 absolute 放棄 fixed，徹底避開 iOS/Android 鍵盤推擠機制
                const panelHeight = Math.round(window.innerHeight * 0.85);
                embeddedRoot.style.cssText = `
                    position: absolute; left: 0; right: 0;
                    width: 100%; height: ${panelHeight}px; max-height: 100%;
                    transform: none;
                    z-index: 999; overflow: hidden; background: #fff;
                    box-shadow: 0 -4px 15px rgba(0,0,0,0.12);
                    border-radius: 20px 20px 0 0;
                `;
            } else {
                embeddedRoot.style.cssText = `
                    position: relative; width: 100%; height: 82vh;
                    min-height: 600px; flex-shrink: 0;
                    z-index: 100; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                    border-radius: 8px; overflow: hidden; order: ${placement === 'top' ? '-1' : '9999'};
                `;
            }
        }

        phoneFrame.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            border: none; border-radius: 0; padding: 0;
            box-shadow: none; display: block; background: #fff;
        `;
        embeddedRoot.appendChild(phoneFrame);
        
        if (isMobile && !isStandalone) {
            // 行動端掛到 body，脫離 #chat 捲動容器
            document.body.appendChild(embeddedRoot);
            if (embedObserver) embedObserver.disconnect();
            embedObserver = null;

            // 鍵盤彈出時，面板若比可視區高會撐出滾動條（黑底露出）
            // 用 visualViewport.resize 即時縮減高度，收鍵盤後還原
            if (window.visualViewport) {
                const _origPanelH = Math.round(window.innerHeight * 0.85);
                window.visualViewport.addEventListener('resize', function() {
                    if (!embeddedRoot) return;
                    const vvH = window.visualViewport.height;
                    embeddedRoot.style.height = Math.min(_origPanelH, Math.round(vvH * 0.95)) + 'px';
                    
                    // 🌟 核心修復：強制把被瀏覽器推上去的視口拉回頂部
                    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                        setTimeout(() => {
                            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                            document.body.scrollTop = 0;
                        }, 50); // 稍微延遲以覆蓋瀏覽器的預設滾動
                    }
                });
            }
        } else {
            if (placement === 'top') {
                containerEl.insertBefore(embeddedRoot, containerEl.firstChild);
            } else {
                containerEl.appendChild(embeddedRoot);
            }
            if (embedObserver) embedObserver.disconnect();
            embedObserver = new MutationObserver(() => {
                if (!isEmbedded || !embeddedRoot || !embeddedRoot.parentNode) return;
                if (placement === 'bottom' && containerEl.lastElementChild !== embeddedRoot) {
                    containerEl.appendChild(embeddedRoot);
                    containerEl.scrollTop = containerEl.scrollHeight;
                } else if (placement === 'top' && containerEl.firstElementChild !== embeddedRoot) {
                    containerEl.insertBefore(embeddedRoot, containerEl.firstChild);
                }
            });
            embedObserver.observe(containerEl, { childList: true });
        }

        // ── 獨立模式：JS 強制把底部導覽列釘死到真實視口底部 ──
        // 這是 CSS position:fixed 的保險層，確保即使 CSS 快取還是舊版也能正確定位
        if (isStandalone) {
            function applyNavFix() {
                const nav = document.getElementById('aurelia-bottom-nav');
                const tabCont = document.getElementById('aurelia-tab-container');
                if (!nav) return false;

                // 讀取真實 safe-area（iOS home indicator 區域）
                // 建立臨時 DOM 元素量測 env(safe-area-inset-bottom) 的實際像素值
                const safeAreaBottom = (() => {
                    const el = document.createElement('div');
                    el.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);width:0;pointer-events:none;visibility:hidden;';
                    document.body.appendChild(el);
                    const h = el.offsetHeight || 0;
                    document.body.removeChild(el);
                    return h;
                })();

                const NAV_H = 55; // nav 可見內容高度 px

                // 強制 nav 貼底（inline !important 覆蓋所有 CSS）
                nav.style.setProperty('position',       'fixed',             'important');
                nav.style.setProperty('bottom',         '0px',               'important');
                nav.style.setProperty('left',           '0px',               'important');
                nav.style.setProperty('right',          '0px',               'important');
                nav.style.setProperty('width',          '100%',              'important');
                nav.style.setProperty('height',         NAV_H + 'px',        'important');
                nav.style.setProperty('padding-bottom', safeAreaBottom + 'px','important');
                nav.style.setProperty('box-sizing',     'content-box',       'important');
                nav.style.setProperty('align-items',    'center',            'important');
                nav.style.setProperty('z-index',        '9999',              'important');

                // tab 容器：position:absolute 填滿 nav 上方空間
                if (tabCont) {
                    const totalNavH = NAV_H + safeAreaBottom;
                    tabCont.style.setProperty('position', 'absolute', 'important');
                    tabCont.style.setProperty('top',    '0px',             'important');
                    tabCont.style.setProperty('left',   '0px',             'important');
                    tabCont.style.setProperty('right',  '0px',             'important');
                    tabCont.style.setProperty('bottom', totalNavH + 'px',  'important');
                    tabCont.style.setProperty('flex',   'none',            'important');
                    tabCont.style.setProperty('height', 'auto',            'important');
                }
                return true;
            }

            // 初始修正：nav 可能尚未掛載，持續重試直到成功
            requestAnimationFrame(function _fixNav() {
                if (!applyNavFix()) requestAnimationFrame(_fixNav);
            });

            // 螢幕旋轉時 safe-area-inset 會改變，重新套用修正
            window.addEventListener('orientationchange', function() {
                setTimeout(applyNavFix, 300); // 等待旋轉動畫完成再量測
            });
            window.addEventListener('resize', function() {
                applyNavFix();
            });
        }

        isVisible = true;
        if (window.VoidTerminal && window.VoidTerminal.onShow) window.VoidTerminal.onShow();
    };

    AureliaControlCenter.unmountEmbedded = function() {
        if (!isEmbedded || !embeddedRoot) return;
        if (embedObserver) { embedObserver.disconnect(); embedObserver = null; }

        if (phoneModal) {
            phoneModal.appendChild(phoneFrame);
            phoneFrame.style.position = 'fixed';
            phoneFrame.style.display = 'none';
        }
        if (embeddedRoot.parentNode) embeddedRoot.parentNode.removeChild(embeddedRoot);
        embeddedRoot = null;
        isEmbedded = false;
        isVisible = false;
        if (window.VoidTerminal && window.VoidTerminal.onHide) window.VoidTerminal.onHide();
    };

    AureliaControlCenter.show = function() {
        if (isVisible && phoneModal) return;
        if (!phoneModal) phoneModal = createPhoneModal();
        if (isEmbedded) {
            if (phoneFrame) phoneFrame.style.display = 'block';
        } else {
            phoneModal.style.display = 'block';
            phoneFrame.style.display = 'block';
            startSyncing();
        }
        isVisible = true;
        if (window.VoidTerminal && window.VoidTerminal.onShow) window.VoidTerminal.onShow();
    };

    AureliaControlCenter.hide = function() {
        if (!isVisible) return;
        if (isEmbedded) AureliaControlCenter.unmountEmbedded();
        else {
            stopSyncing();
            if (phoneFrame) phoneFrame.style.display = 'none';
        }
        isVisible = false;
        if (window.VoidTerminal && window.VoidTerminal.onHide) window.VoidTerminal.onHide();
    };

    AureliaControlCenter.setSyncTarget = function(selector) {
        if (selector) syncTargetSelector = selector;
    };

    AureliaControlCenter.toggle = () => isVisible ? AureliaControlCenter.hide() : AureliaControlCenter.show();
    AureliaControlCenter.isVisible = () => isVisible;
    AureliaControlCenter.isEmbeddedMounted = () => isEmbedded;
    AureliaControlCenter.switchPage = switchPage;
    AureliaControlCenter.showVnPanel = showVnPanel;
    AureliaControlCenter.hideVnPanel = hideVnPanel;

    AureliaControlCenter.setChatTitle = function(title) {
        const el = document.getElementById('aurelia-current-chat-title');
        if (el) { el.textContent = title; el.title = title; }
        const homeEl = document.getElementById('home-chat-title');
        if (homeEl) { homeEl.textContent = `[Session] ${title}`; homeEl.title = title; }
    };

    AureliaControlCenter.launchGameApp = function(key) {
        const GAME_APP_MAP = {
            qb:         () => window.OS_QUEST_BOARD?.launchApp,
            pet:        () => window.PET_SHOP?.launch,
            pet_home:   () => window.PET_HOME?.launch,
            tarot:      () => window.OS_TAROT?.launch,
            rpg:        () => window.RPG_PANEL?.launch,
            worldbook:  () => window.OS_WORLDBOOK?.launch,
        };
        const getFn = GAME_APP_MAP[key];
        if (!getFn) return;
        const launchFn = getFn();
        if (typeof launchFn !== 'function') return;
        
        const root = phoneFrame;
        if (!root) return;
        
        // 🌟 遊戲類一律使用全域視窗，確保不會被 Tab 切換遮擋
        const appContainer = root.querySelector('#aurelia-iframe-container');
        const panel = root.querySelector('#aurelia-panel-container');
        if (!appContainer || !panel) return;

        appContainer.innerHTML = '';
        const div = document.createElement('div');
        div.style.cssText = 'position:relative; width:100%; height:100%; overflow:auto;';
        appContainer.appendChild(div);

        const doClose = () => {
            panel.style.display = 'none';
            if (window.VoidTerminal && window.VoidTerminal.resumeLobbyActivity) window.VoidTerminal.resumeLobbyActivity();
        };

        if (window.PhoneSystem) window.PhoneSystem.goHome = doClose;

        div.addEventListener('click', (e) => {
            const btn = e.target.closest('[onclick]');
            if (!btn) return;
            const attr = btn.getAttribute('onclick') || '';
            if (attr.includes('goHome')) { e.preventDefault(); e.stopPropagation(); doClose(); }
        }, true);

        launchFn(div);
        panel.style.display = 'flex';
        if (window.VoidTerminal && window.VoidTerminal.suspendLobbyActivity) window.VoidTerminal.suspendLobbyActivity();
    };

    AureliaControlCenter.showOsApp = function(appName) {
        if (!isVisible) AureliaControlCenter.show();
        const root = phoneFrame;
        if (!root) return;

        // 🌟 雙視窗路由：判斷是否為「寫作專用 App」
        const isWriteApp = ['設置', '世界書', 'worldbook', '提示詞', '思考記錄', 'think', 'avs', '變數工坊'].includes(appName);

        // 🌟 寫作類 App 必須先切換到寫作 TAB，否則 write-panel-container 在其他 tab 下是 display:none
        if (isWriteApp) switchPage('nav-write');

        // 自動選擇要注入的視窗容器
        const containerId = isWriteApp ? '#write-iframe-container' : '#aurelia-iframe-container';
        const panelId = isWriteApp ? '#write-panel-container' : '#aurelia-panel-container';

        const container = root.querySelector(containerId);
        const panel = root.querySelector(panelId);

        if (container) {
            container.innerHTML = '';
            const div = document.createElement('div');
            div.style.cssText = 'width: 100%; height: 100%; overflow: auto; background: #1e1e1e;';
            container.appendChild(div);

            const map = {
                '設置': window.OS_SETTINGS,
                '世界書': window.OS_WORLDBOOK || window.OS_LOREBOOK,
                'worldbook': window.OS_WORLDBOOK || window.OS_LOREBOOK,
                '提示詞': window.OS_PROMPTS,
                '思考記錄': window.OS_THINK,
                'think': window.OS_THINK,
                '系統診斷': window.OS_MONITOR,
                'RPG 狀態': window.RPG_PANEL,
                '視差引擎': window.OS_QUEST_BOARD,
                'avs': window.OS_AVS,
                '變數工坊': window.OS_AVS,
                // wx/wb/錢包 (phone_system shim 已將它們存入 __PHONE_APPS)
                '微信':    { launch: (c) => window.__PHONE_APPS?.['微信']?.(c) },
                '微博':    { launch: (c) => window.__PHONE_APPS?.['微博']?.(c) },
                '電子錢包':{ launch: (c) => window.__PHONE_APPS?.['電子錢包']?.(c) },
            };

            const _panelClose = () => {
                if (panel) panel.style.display = 'none';
                if (window.VoidTerminal && window.VoidTerminal.resumeLobbyActivity) window.VoidTerminal.resumeLobbyActivity();
            };
            if (window.PhoneSystem) window.PhoneSystem.goHome = _panelClose;

            const originalLaunchApp = map[appName]?.launchApp || map[appName]?.launch;
            if (originalLaunchApp) {
                originalLaunchApp(div);
                setTimeout(() => {
                    const selectors = ['#nav-home', '#pm-nav-home', '.set-back-btn', '.lb-back-btn', '.qb-back-btn', '.mon-back-btn', '.pm-back-btn', '.rpg-back-btn', '.am-btn-icon', '#avs-nav-home', '[onclick*=\"goHome\"]'];
                    selectors.forEach(selector => {
                        div.querySelectorAll(selector).forEach(btn => {
                            const onclickAttr = btn.getAttribute('onclick');
                            const shouldHijack = selector === '[onclick*=\"goHome\"]' || selector === '#nav-home' || selector.includes('back-btn') || selector === '#avs-nav-home' || (onclickAttr && onclickAttr.includes('goHome'));
                            if (shouldHijack) {
                                btn.removeAttribute('onclick');
                                btn.onclick = (e) => { 
                                    e.preventDefault(); e.stopPropagation(); 
                                    if (panel) panel.style.display = 'none'; 
                                    if (window.VoidTerminal && window.VoidTerminal.resumeLobbyActivity) window.VoidTerminal.resumeLobbyActivity();
                                };
                            }
                        });
                    });
                }, 200);
            } else {
                div.innerHTML = `<div style=\"color:#e06060;padding:20px;\">App 未就緒 (${appName})</div>`;
            }
        }
        if (panel) panel.style.display = 'flex';
        if (window.VoidTerminal && window.VoidTerminal.suspendLobbyActivity) window.VoidTerminal.suspendLobbyActivity();
    };

    setTimeout(() => { if (!phoneModal) phoneModal = createPhoneModal(); }, 0);
    console.log('✅ 控制中心模組 (v4.8.3 - 雙視窗路由架構) 已加載');

})(window.AureliaControlCenter = window.AureliaControlCenter || {});