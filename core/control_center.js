/**
 * ========================
 * Aurelia Control Center (v4.8.1 - UI Text Fix)
 * 控制中心 - 外殼與路由核心
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

    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || window.innerWidth < 768;
    }

    function syncModalToChat() {
        if (!phoneFrame || !isVisible || isEmbedded) return;
        const chatEl = document.querySelector('#chat');
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
            const chatEl = document.querySelector('#chat');
            if (chatEl) ro.observe(chatEl);
        }
    }

    function stopSyncing() {
        if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    }

    function createBottomNav(parentDoc) {
        const nav = parentDoc.createElement('div');
        nav.id = CONFIG.BOTTOM_NAV_ID; 
        nav.style.cssText = `height: 55px; background: #ffffff; border-top: 1px solid #e0e5ec; display: flex; justify-content: center; align-items: center; gap: 15px; box-shadow: 0 -5px 15px rgba(0,0,0,0.02); flex-shrink: 0; z-index: 200; position: relative;`;

        // 🔥 改名為「我」
        const items = [
            { id: 'nav-home',  icon: 'fa-solid fa-cube',                  active: true,  title: '大廳' },
            { id: 'nav-story', icon: 'fa-solid fa-plug',                  active: false, title: 'DIVE' },
            { id: 'nav-user',  icon: 'fa-solid fa-user',                  active: false, title: '我' },
            { id: 'nav-close', icon: 'fa-solid fa-power-off', isClose: true,             title: '登出' }
        ];

        items.forEach(item => {
            const btn = parentDoc.createElement('div');
            btn.className = 'nav-button';
            btn.dataset.navId = item.id;
            btn.style.cssText = `padding: 8px 16px; cursor: pointer; border-radius: 12px; color: ${item.active ? '#2b6cb0' : '#a0aec0'}; display: flex; align-items: center; gap: 6px; font-family: sans-serif; transition: 0.2s; ${item.active ? 'background:#ebf8ff;' : ''}`;
            btn.innerHTML = `<i class="${item.icon}" style="font-size: 16px;"></i><span style="font-size:12px; font-weight:bold;">${item.title}</span>`;
            
            btn.onclick = () => { 
                if (item.isClose) AureliaControlCenter.hide(); 
                else switchPage(item.id); 
            };
            nav.appendChild(btn);
        });
        return nav;
    }

    function switchPage(pageId) {
        const root = isEmbedded ? embeddedRoot : phoneModal;
        if (!root && !isEmbedded) return;
        const container = isEmbedded ? phoneFrame : root;

        container.querySelectorAll('.nav-button').forEach(btn => {
            if (btn.dataset.navId === 'nav-close') return;
            const active = btn.dataset.navId === pageId;
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

        if (pageId === 'nav-story') {
            if (window.VoidTerminal && window.VoidTerminal.suspendIdle) window.VoidTerminal.suspendIdle();
            const vnContainer = container.querySelector('#aurelia-vn-app-container');
            if (vnContainer && !vnContainer.dataset.vnInited) {
                if (window.VN_PLAYER && window.VN_PLAYER.launchApp) {
                    window.VN_PLAYER.launchApp(vnContainer);
                    vnContainer.dataset.vnInited = 'true';
                } else {
                    setTimeout(() => {
                        if (window.VN_PLAYER && window.VN_PLAYER.launchApp && !vnContainer.dataset.vnInited) {
                            window.VN_PLAYER.launchApp(vnContainer);
                            vnContainer.dataset.vnInited = 'true';
                        }
                    }, 2000);
                }
            }
        } 
        else if (pageId === 'nav-home') {
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

        if (pageId !== 'nav-story') {
            const extractorContainer = container.querySelector('#aurelia-extractor-container-vn');
            if (extractorContainer) { extractorContainer.style.display = 'none'; extractorContainer.classList.remove('show'); }
            const storyExtractorContainer = container.querySelector('#story-extractor-container-vn');
            if (storyExtractorContainer) { storyExtractorContainer.style.display = 'none'; storyExtractorContainer.classList.remove('show'); }
            if (window.AureliaHtmlExtractor?.hide) window.AureliaHtmlExtractor.hide();
            if (window.StoryExtractor?.hide) window.StoryExtractor.hide();
        }
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

        const storyTab = parentDoc.createElement('div');
        storyTab.id = 'aurelia-story-tab';
        storyTab.className = 'aurelia-tab';
        storyTab.style.cssText = `width:100%; height:100%; display:none; background:#000; position: relative; flex-direction:column;`;

        const vnAppContainer = parentDoc.createElement('div');
        vnAppContainer.id = 'aurelia-vn-app-container';
        vnAppContainer.style.cssText = 'width:100%; height:100%; overflow:hidden; position:relative;';
        storyTab.appendChild(vnAppContainer);

        const extractorContainer = parentDoc.createElement('div');
        extractorContainer.id = 'aurelia-extractor-container-vn';
        extractorContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0a0a0a; z-index: 1000; overflow: hidden; display: none; flex-direction: column;`;
        storyTab.appendChild(extractorContainer);

        const storyExtractorContainer = parentDoc.createElement('div');
        storyExtractorContainer.id = 'story-extractor-container-vn';
        storyExtractorContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0a0a0a; border: 2px solid #d4af37; z-index: 1001; overflow: hidden; display: none; flex-direction: column;`;
        storyTab.appendChild(storyExtractorContainer);

        const userTab = parentDoc.createElement('div');
        userTab.id = 'aurelia-user-tab';
        userTab.className = 'aurelia-tab';
        userTab.style.cssText = `width:100%; height:100%; display:none; background:#f8f9fa; position: relative; flex-direction:column; overflow:hidden;`;

        container.appendChild(homeTab);
        container.appendChild(storyTab);
        container.appendChild(userTab);
        return container;
    }

    function createPhoneScreen(parentDoc) {
        const screen = parentDoc.createElement('div');
        screen.id = CONFIG.PHONE_SCREEN_ID;
        screen.style.cssText = `width: 100%; height: 100%; background: #f8f9fa; overflow: hidden; display: flex; flex-direction: column; position: relative;`;
        screen.appendChild(createTabContainer(parentDoc));
        screen.appendChild(createBottomNav(parentDoc));

        const slidePanel = parentDoc.createElement('div');
        slidePanel.id = 'aurelia-panel-container';
        slidePanel.style.cssText = `position: absolute; top:0; left:0; width:100%; height:100%; background: #1a1a1a; z-index: 50; transform: translateX(100%); transition: transform 0.3s; display: flex; flex-direction: column;`;
        slidePanel.innerHTML = `<div id=\"aurelia-iframe-container\" style=\"width:100%; height:100%; background:#000; overflow:hidden; position:relative;\"></div>`;
        screen.appendChild(slidePanel);
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

        if (!embeddedRoot) {
            embeddedRoot = document.createElement('div');
            embeddedRoot.id = 'aurelia-embedded-root';
            embeddedRoot.style.cssText = `
                position: relative; width: 100%; height: ${isMobile ? '85vh' : '82vh'}; 
                min-height: ${isMobile ? '400px' : '600px'}; flex-shrink: 0; 
                z-index: 100; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                border-radius: 8px; overflow: hidden; order: ${placement === 'top' ? '-1' : '9999'};
            `;
        }

        phoneFrame.style.cssText = `
            width: 100%; height: 100%; border: none; border-radius: 0;
            padding: 0; position: absolute; top: 0; left: 0;
            box-shadow: none; display: block; background: #fff;
        `;
        embeddedRoot.appendChild(phoneFrame);
        
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

    AureliaControlCenter.toggle = () => isVisible ? AureliaControlCenter.hide() : AureliaControlCenter.show();
    AureliaControlCenter.isVisible = () => isVisible;
    AureliaControlCenter.isEmbeddedMounted = () => isEmbedded;
    AureliaControlCenter.switchPage = switchPage;

    AureliaControlCenter.setChatTitle = function(title) {
        const el = document.getElementById('aurelia-current-chat-title');
        if (el) { el.textContent = title; el.title = title; }
        const homeEl = document.getElementById('home-chat-title');
        if (homeEl) { homeEl.textContent = `[Session] ${title}`; homeEl.title = title; }
    };

    AureliaControlCenter.launchGameApp = function(key) {
        const GAME_APP_MAP = {
            child:      () => window.CHILD_CORE?.launch,
            inv:        () => window.INV_CORE?.launchApp,
            qb:         () => window.OS_QUEST_BOARD?.launchApp,
            host:       () => window.HOST_CLUB?.launch,
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
        const appContainer = root.querySelector('#aurelia-iframe-container');
        const panel = root.querySelector('#aurelia-panel-container');
        if (!appContainer || !panel) return;

        appContainer.innerHTML = '';
        const div = document.createElement('div');
        div.style.cssText = 'position:relative; width:100%; height:100%; overflow:auto;';
        appContainer.appendChild(div);

        const doClose = () => {
            panel.style.transform = 'translateX(100%)';
            if (window.INV_CORE && typeof window.INV_CORE.stopBgm === 'function') window.INV_CORE.stopBgm();
            if (window.CHILD_CORE && typeof window.CHILD_CORE.stopBgm === 'function') window.CHILD_CORE.stopBgm();
            if (window.VoidTerminal && window.VoidTerminal.resumeLobbyActivity) window.VoidTerminal.resumeLobbyActivity();
        };

        div.addEventListener('click', (e) => {
            const btn = e.target.closest('[onclick]');
            if (!btn) return;
            const attr = btn.getAttribute('onclick') || '';
            if (attr.includes('goHome')) { e.preventDefault(); e.stopPropagation(); doClose(); }
        }, true);

        launchFn(div);
        panel.style.transform = 'translateX(0)';
        if (window.VoidTerminal && window.VoidTerminal.suspendLobbyActivity) window.VoidTerminal.suspendLobbyActivity();
    };

    AureliaControlCenter.showOsApp = function(appName) {
        if (!isVisible) AureliaControlCenter.show();
        const root = phoneFrame;
        if (!root) return;
        const container = root.querySelector('#aurelia-iframe-container');
        const panel = root.querySelector('#aurelia-panel-container');

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
                '刑案調查': window.INV_CORE,
                '視差引擎': window.OS_QUEST_BOARD,
            };

            const originalLaunchApp = map[appName]?.launchApp || map[appName]?.launch;
            if (originalLaunchApp) {
                originalLaunchApp(div);
                setTimeout(() => {
                    const selectors = ['#nav-home', '#pm-nav-home', '.set-back-btn', '.lb-back-btn', '.qb-back-btn', '.mon-back-btn', '.pm-back-btn', '.rpg-back-btn', '.am-btn-icon', '[onclick*=\"goHome\"]'];
                    selectors.forEach(selector => {
                        div.querySelectorAll(selector).forEach(btn => {
                            const onclickAttr = btn.getAttribute('onclick');
                            const shouldHijack = selector === '[onclick*=\"goHome\"]' || selector === '#nav-home' || selector.includes('back-btn') || (onclickAttr && onclickAttr.includes('goHome'));
                            if (shouldHijack) {
                                btn.removeAttribute('onclick');
                                btn.onclick = (e) => { 
                                    e.preventDefault(); e.stopPropagation(); 
                                    if (panel) panel.style.transform = 'translateX(100%)'; 
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
        if (panel) panel.style.transform = 'translateX(0)';
        if (window.VoidTerminal && window.VoidTerminal.suspendLobbyActivity) window.VoidTerminal.suspendLobbyActivity();
    };

    setTimeout(() => { if (!phoneModal) phoneModal = createPhoneModal(); }, 0);
    console.log('✅ 控制中心模組 (v4.8.1 - 修正標籤名稱) 已加載');

})(window.AureliaControlCenter = window.AureliaControlCenter || {});