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
    let _hiddenChatEl = null;   // 「只在訊息區」模式下被收起的 #chat，卸載時還原
    let syncTargetSelector = '#sheld';
    let _vnWasOpenBeforeTabSwitch = false;
    let _readerWasOpenBeforeTabSwitch = false;

    // ── 全屏狀態（覆蓋在 modal / embedded 之上的視覺模式） ──
    let isFullscreen = false;
    let _fsPrevParent = null;
    let _fsPrevSibling = null;
    let _fsPrevStyle = '';

    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || window.innerWidth < 768;
    }

    function syncModalToChat() {
        if (!phoneFrame || !isVisible || isEmbedded || isFullscreen) return;
        phoneFrame.style.position = 'fixed';
        // 📱 手機瀏覽器：#sheld 的 rect 含動態網址列後面那塊(100vh 老問題)，比可見視窗大/偏移
        //    → 浮窗被頂到瀏覽器外面。改釘在真實可見視窗(visualViewport 優先，跟著網址列/鍵盤縮；
        //    退 innerWidth/innerHeight)。Tauri 無動態網址列 rect 本來就準、不受影響。
        if (isMobileDevice()) {
            const vv = window.visualViewport;
            phoneFrame.style.left   = (vv ? vv.offsetLeft : 0) + 'px';
            phoneFrame.style.top    = (vv ? vv.offsetTop  : 0) + 'px';
            phoneFrame.style.width  = (vv ? vv.width  : window.innerWidth)  + 'px';
            phoneFrame.style.height = (vv ? vv.height : window.innerHeight) + 'px';
            return;
        }
        const chatEl = document.querySelector(syncTargetSelector) || document.querySelector('#sheld') || document.querySelector('#chat');
        if (!chatEl) return;
        const rect = chatEl.getBoundingClientRect();
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

    // ── 舊「底部/左側導覽列」(大廳 / 寫作 / 關閉) 已移除（2026-06-12）──
    //    關閉 → 大廳 MAIN MENU 一顆 void-btn 接 AureliaControlCenter.requestClose()。
    //    寫作工具(系統設置/變數工坊/創作室/世界書/提示詞)改成大廳手機殼(VoidPhoneShell)的 app，
    //    寫作頁(write-tab)已整個退役。遊戲/VN/OS app 本來就各自有返回鈕，不靠這條 rail。

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

        // 同樣：切離大廳時暫時隱藏 VN_READER；回到大廳時自動恢復
        const vnReader = document.getElementById('vn-reader-sa') || container.querySelector('#vn-reader-sa');
        if (vnReader) {
            if (pageId !== 'nav-home' && vnReader.style.display !== 'none') {
                _readerWasOpenBeforeTabSwitch = true;
                vnReader.style.display = 'none';
            } else if (pageId === 'nav-home' && _readerWasOpenBeforeTabSwitch) {
                _readerWasOpenBeforeTabSwitch = false;
                vnReader.style.display = 'flex';
            }
        }

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
                else if (action === 'autoload' && window._lobbyPendingChapter && window.VN_Core) {
                    const p = window._lobbyPendingChapter;
                    window._lobbyPendingChapter = null;
                    try { window.VN_Core.earlybirdFromText(p.content); } catch (e) {}  // 頭像早鳥：先開生
                    window.VN_Core._startWithLoader(p.content, null);   // 載入→loading 等全部圖片→開播
                }
            }, delay);
        }

        vnPanel.style.display = 'flex';
        // 🎬 劇情全螢幕沉浸：隱藏全域 header（hideVnPanel 時還原）
        { const _hdr = document.querySelector('.void-top-bar'); if (_hdr) _hdr.style.display = 'none'; }

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

        // 🛟 先呼叫 StoryExtractor.hide() 把劫持的 #form_sheld 還回原位，
        // 否則直接藏 storyExtractorContainer 會讓酒館原生輸入框跟著消失
        if (window.StoryExtractor?.hide) {
            try { window.StoryExtractor.hide(); } catch (_) {}
        }

        const extractorContainer = document.getElementById('aurelia-extractor-container-vn');
        if (extractorContainer) { extractorContainer.style.display = 'none'; extractorContainer.classList.remove('show'); }
        const storyExtractorContainer = document.getElementById('story-extractor-container-vn');
        if (storyExtractorContainer) { storyExtractorContainer.style.display = 'none'; storyExtractorContainer.classList.remove('show'); }
        if (window.AureliaHtmlExtractor?.hide) window.AureliaHtmlExtractor.hide();

        // 強制讓所有 tab 隱藏，只顯示 home tab，並同步底部 nav 高亮
        document.querySelectorAll('.aurelia-tab').forEach(t => { t.style.display = 'none'; });
        const homeTab = document.getElementById('aurelia-home-tab');
        if (homeTab) homeTab.style.display = 'flex';
        // 🎬 離開劇情：還原全域 header
        { const _hdr = document.querySelector('.void-top-bar'); if (_hdr) _hdr.style.display = ''; }

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

        container.appendChild(homeTab);
        container.appendChild(userTab);
        return container;
    }

    function createPhoneScreen(parentDoc) {
        const screen = parentDoc.createElement('div');
        screen.id = CONFIG.PHONE_SCREEN_ID;
        screen.style.cssText = `width: 100%; height: 100%; background: #f8f9fa; overflow: hidden; display: flex; flex-direction: column; position: relative;`;
        screen.appendChild(createTabContainer(parentDoc));

        // 🌟 雙層架構 2：全螢幕全域視窗 (給遊戲 Apps 使用，避開底部導覽列)
        const slidePanel = parentDoc.createElement('div');
        slidePanel.id = 'aurelia-panel-container';
        slidePanel.style.cssText = `position: absolute; top:0; left:0; right:0; bottom: 0; background: #EEF0F6; z-index: 50; display: none; flex-direction: column;`;
        slidePanel.innerHTML = `<div id=\"aurelia-iframe-container\" style=\"width:100%; height:100%; background:#EEF0F6; overflow:hidden; position:relative;\"></div>`;
        screen.appendChild(slidePanel);

        // 🌟 VN 專用全螢幕 overlay（從大廳直接彈出，z-index 51 覆蓋其他 overlay）
        const vnPanel = parentDoc.createElement('div');
        vnPanel.id = 'aurelia-vn-panel';
        vnPanel.style.cssText = `position: absolute; top:0; left:0; right:0; bottom: 0; background:#000; z-index: 51; display: none; flex-direction: column;`;

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

    // 全屏按鈕的視覺 icon 由 void_terminal.js 在大廳頂部 bar 裡渲染（喇叭旁邊）；
    // 這裡只負責同步 emoji 文字，不限定按鈕位置
    function updateFullscreenBtnIcon() {
        const btn = document.getElementById('aurelia-fullscreen-btn');
        if (!btn) return;
        btn.textContent = isFullscreen ? '🗗' : '⛶';
        btn.title = isFullscreen ? '退出全屏 (ESC)' : '進入全屏';
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

    // 「只在訊息區」收起 #chat：❌不用 display:none（會讓 TavernHelper 不煮 ```html 卡、#chat 捲不動
    //   → html_extractor/story_extractor 靠 live DOM+捲底渲染的抓取全抓空）。✅改「off-screen 絕對定位 +
    //   visibility:hidden」→ #chat 仍有 layout(TH 照煮卡/可捲/extractor 讀得到)、視覺隱形、且移出 flex 流讓位給奧瑞亞。
    function _applyChatHidden(el) {
        if (!el) return;
        if (el.dataset.aureliaPrevCss == null) el.dataset.aureliaPrevCss = el.getAttribute('style') || '';
        el.style.setProperty('position', 'absolute', 'important');
        el.style.setProperty('left', '-99999px', 'important');
        el.style.setProperty('top', '0', 'important');
        el.style.setProperty('width', '480px', 'important');
        el.style.setProperty('height', '90vh', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('z-index', '-1', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
    }
    function _restoreChat(el) {
        if (!el) return;
        if (el.dataset.aureliaPrevCss != null) { el.setAttribute('style', el.dataset.aureliaPrevCss); if (!el.getAttribute('style')) el.removeAttribute('style'); }
        delete el.dataset.aureliaPrevCss;
    }

    AureliaControlCenter.mountEmbedded = function(containerEl, placement = 'bottom') {
        if (!phoneModal) phoneModal = createPhoneModal();
        stopSyncing();
        isEmbedded = true;
        
        const isMobile = isMobileDevice();
        // 🌟 判斷當前是否處於獨立全螢幕模式 (index.html)
        const isStandalone = containerEl && containerEl.id === 'aurelia-standalone-root';
        // 「只在訊息區」模式：選到 #chat。#chat 是會捲動 + 酒館不斷塞訊息的容器，
        //   不能鑽進去（會跟著捲走、被清空）。改當 #sheld 的 flex 兄弟、佔訊息區的位置、
        //   把 #chat 收起，輸入框 #form_sheld 留在底部照常可用。
        const messagesOnly = !isStandalone && containerEl && containerEl.id === 'chat';
        const sheld = messagesOnly ? (containerEl.closest('#sheld') || containerEl.parentElement) : null;

        if (!embeddedRoot) {
            embeddedRoot = document.createElement('div');
            embeddedRoot.id = 'aurelia-embedded-root';
        }
        // 每次掛載依模式重設樣式，避免切換模式殘留舊定位
        if (isStandalone) {
            // 獨立全螢幕模式：height: 100% 繼承父元素
            embeddedRoot.style.cssText = `
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                width: 100%; z-index: 100; overflow: hidden;
            `;
        } else if (messagesOnly) {
            // flex 兄弟：撐滿訊息區空間，輸入框留在下方
            embeddedRoot.style.cssText = `
                position: relative; flex: 1 1 auto; min-height: 0; width: 100%;
                z-index: 999;
                background: #fff;
                box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                border-radius: 8px;
                overflow: hidden;
            `;
        } else if (isMobile) {
            // 用 absolute 占滿 #sheld 整個區域，z-index 蓋過 form_sheld (z-index:30)
            embeddedRoot.style.cssText = `
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                width: 100%;
                z-index: 999;
                background: #fff;
                box-shadow: 0 -4px 15px rgba(0,0,0,0.12);
                border-radius: 12px;
                overflow: hidden;
            `;
        } else {
            // desktop：跟 mobile 一樣 absolute 占滿 #sheld，z-index 蓋過 form_sheld
            embeddedRoot.style.cssText = `
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                width: 100%;
                z-index: 999;
                background: #fff;
                box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                border-radius: 8px;
                overflow: hidden;
            `;
        }

        phoneFrame.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            border: none; border-radius: 0; padding: 0;
            box-shadow: none; display: block; background: #fff;
        `;
        embeddedRoot.appendChild(phoneFrame);

        if (messagesOnly) {
            // 收起 #chat（off-screen 隱藏、保 layout 給 extractor 讀），把奧瑞亞插在輸入框前面
            _hiddenChatEl = containerEl;
            _applyChatHidden(containerEl);
            const form = sheld.querySelector('#form_sheld');
            if (form) sheld.insertBefore(embeddedRoot, form);
            else sheld.appendChild(embeddedRoot);

            if (embedObserver) embedObserver.disconnect();
            embedObserver = new MutationObserver(() => {
                if (!isEmbedded || !embeddedRoot) return;
                // 酒館重繪時保證 #chat 維持收起（off-screen）、奧瑞亞還在 #sheld 內
                if (_hiddenChatEl && _hiddenChatEl.style.visibility !== 'hidden') _applyChatHidden(_hiddenChatEl);
                if (embeddedRoot.parentNode !== sheld) {
                    const f = sheld.querySelector('#form_sheld');
                    if (f) sheld.insertBefore(embeddedRoot, f); else sheld.appendChild(embeddedRoot);
                }
            });
            embedObserver.observe(sheld, { childList: true });
        } else {
            // 用 absolute 必須有定位錨點：containerEl 若是 static 就強制改 relative
            if (!isStandalone && containerEl && getComputedStyle(containerEl).position === 'static') {
                containerEl.style.position = 'relative';
                containerEl.dataset.aureliaPosForced = '1';
            }

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

        // ── 獨立模式：JS 強制把 tab 容器填滿整個視口（底部 rail 已移除）──
        // CSS 快取保險層：即使舊版 CSS 還留著「讓 55px 給 rail」的 bottom，也用 inline !important 蓋掉。
        if (isStandalone) {
            function applyTabFix() {
                const tabCont = document.getElementById('aurelia-tab-container');
                if (!tabCont) return false;

                // 讀取真實 safe-area（iOS home indicator 區域）
                const safeAreaBottom = (() => {
                    const el = document.createElement('div');
                    el.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);width:0;pointer-events:none;visibility:hidden;';
                    document.body.appendChild(el);
                    const h = el.offsetHeight || 0;
                    document.body.removeChild(el);
                    return h;
                })();

                // tab 容器：position:absolute 填滿整個視口，只留 home indicator 安全區
                tabCont.style.setProperty('position', 'absolute',          'important');
                tabCont.style.setProperty('top',    '0px',                 'important');
                tabCont.style.setProperty('left',   '0px',                 'important');
                tabCont.style.setProperty('right',  '0px',                 'important');
                tabCont.style.setProperty('bottom', safeAreaBottom + 'px', 'important');
                tabCont.style.setProperty('flex',   'none',                'important');
                tabCont.style.setProperty('height', 'auto',                'important');
                return true;
            }

            // 初始修正：tab 容器可能尚未掛載，重試直到成功（找到即停，不會空轉）
            requestAnimationFrame(function _fixTab() {
                if (!applyTabFix()) requestAnimationFrame(_fixTab);
            });

            // 螢幕旋轉時 safe-area-inset 會改變，重新套用
            window.addEventListener('orientationchange', function() {
                setTimeout(applyTabFix, 300);
            });
            window.addEventListener('resize', function() {
                applyTabFix();
            });
        }

        isVisible = true;
        if (window.VoidTerminal && window.VoidTerminal.onShow) window.VoidTerminal.onShow();
    };

    AureliaControlCenter.unmountEmbedded = function() {
        if (!isEmbedded || !embeddedRoot) return;

        // 還原 mount 時被強制改成 relative 的 containerEl
        document.querySelectorAll('[data-aurelia-pos-forced]').forEach(el => {
            el.style.position = '';
            delete el.dataset.aureliaPosForced;
        });

        if (embedObserver) { embedObserver.disconnect(); embedObserver = null; }

        // 還原「只在訊息區」模式收起的 #chat
        if (_hiddenChatEl) {
            _restoreChat(_hiddenChatEl);
            _hiddenChatEl = null;
        }

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

    // ── 真全螢幕（Fullscreen API：連瀏覽器網址列、工作列都消失） ──
    // 注意：必須由使用者手勢（click / keydown）觸發，programmatic 呼叫會被瀏覽器拒絕
    AureliaControlCenter.enterFullscreen = function() {
        if (!phoneFrame || isFullscreen) return;
        if (!isVisible) AureliaControlCenter.show();

        _fsPrevParent = phoneFrame.parentNode;
        _fsPrevSibling = phoneFrame.nextSibling;
        _fsPrevStyle = phoneFrame.style.cssText;

        stopSyncing();

        document.body.appendChild(phoneFrame);
        phoneFrame.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            width: 100vw; height: 100vh;
            background: #fff;
            border: none; border-radius: 0;
            box-shadow: none;
            z-index: 100000;
            display: block;
            pointer-events: auto;
        `;

        isFullscreen = true;
        updateFullscreenBtnIcon();

        // 嘗試進入瀏覽器原生全螢幕（連網址列 / 工作列都消失）
        const reqFs = phoneFrame.requestFullscreen
                   || phoneFrame.webkitRequestFullscreen
                   || phoneFrame.mozRequestFullScreen
                   || phoneFrame.msRequestFullscreen;
        if (reqFs) {
            const result = reqFs.call(phoneFrame);
            if (result && typeof result.catch === 'function') {
                result.catch(err => {
                    console.warn('[Aurelia] 瀏覽器全螢幕被拒（仍維持視窗級全屏）:', err?.message || err);
                });
            }
        }
    };

    AureliaControlCenter.exitFullscreen = function() {
        if (!phoneFrame || !isFullscreen) return;

        // 先退出瀏覽器原生全螢幕（若處於該狀態）
        const fsEl = document.fullscreenElement
                  || document.webkitFullscreenElement
                  || document.mozFullScreenElement
                  || document.msFullscreenElement;
        if (fsEl) {
            const exitFs = document.exitFullscreen
                        || document.webkitExitFullscreen
                        || document.mozCancelFullScreen
                        || document.msExitFullscreen;
            if (exitFs) {
                try {
                    const result = exitFs.call(document);
                    if (result && typeof result.catch === 'function') result.catch(() => {});
                } catch (e) {}
            }
        }

        if (_fsPrevParent) {
            if (_fsPrevSibling && _fsPrevSibling.parentNode === _fsPrevParent) {
                _fsPrevParent.insertBefore(phoneFrame, _fsPrevSibling);
            } else {
                _fsPrevParent.appendChild(phoneFrame);
            }
        }

        phoneFrame.style.cssText = _fsPrevStyle;

        _fsPrevParent = null;
        _fsPrevSibling = null;
        _fsPrevStyle = '';
        isFullscreen = false;

        if (!isEmbedded && isVisible) startSyncing();

        updateFullscreenBtnIcon();
    };

    AureliaControlCenter.toggleFullscreen = function() {
        if (isFullscreen) AureliaControlCenter.exitFullscreen();
        else AureliaControlCenter.enterFullscreen();
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
        // 🛟 任何關閉路徑（🏰 toggle / smartToggle / 切面板 / requestClose）都先把
        // html_extractor / StoryExtractor 劫持的 #form_sheld 還回原位，否則 overlay 被藏起來時
        // 酒館原生輸入框會跟著一起被孤兒化消失。放在唯一咽喉 hide()，避免個別呼叫點漏還原。
        try { if (window.AureliaHtmlExtractor && window.AureliaHtmlExtractor.isVisible) window.AureliaHtmlExtractor.hide(); } catch (_) {}
        try { if (window.StoryExtractor && window.StoryExtractor.isVisible) window.StoryExtractor.hide(); } catch (_) {}

        if (!isVisible) return;
        if (isFullscreen) AureliaControlCenter.exitFullscreen();
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
    AureliaControlCenter.isFullscreen = () => isFullscreen;
    AureliaControlCenter.switchPage = switchPage;
    AureliaControlCenter.showVnPanel = showVnPanel;
    AureliaControlCenter.hideVnPanel = hideVnPanel;

    // 收掉整個奧瑞亞（大廳 MAIN MENU 的「關閉」走這條）。
    // #form_sheld 的還原已統一收進 hide()，這裡直接委派即可。
    AureliaControlCenter.requestClose = function() {
        AureliaControlCenter.hide();
    };

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
            map:        () => window.OS_MAP?.launchApp,
            rpg:        () => window.RPG_PANEL?.launch,
            worldbook:  () => window.OS_WORLDBOOK?.launch,
            journal:    () => window.OS_JOURNAL?.launch,
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

        // 寫作頁已退役（2026-06-12）：所有 App 統一走全域 overlay；寫作工具改從手機殼開。
        // showOsApp 仍保留給 index.js / persona / phone_system shim 等外部呼叫者。
        const containerId = '#aurelia-iframe-container';
        const panelId = '#aurelia-panel-container';

        const container = root.querySelector(containerId);
        const panel = root.querySelector(panelId);

        if (container) {
            container.innerHTML = '';
            const div = document.createElement('div');
            div.style.cssText = 'width: 100%; height: 100%; overflow: auto; background: #EEF0F6;';
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
                '地圖': window.OS_MAP,
                'map': window.OS_MAP,
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

    // ── 全屏事件監聽（瀏覽器級 + 視窗級雙保險） ──
    // 1. fullscreenchange：使用者在瀏覽器原生全螢幕下按 ESC / F11 退出時觸發 → 同步狀態
    function onFsChange() {
        const fsEl = document.fullscreenElement
                  || document.webkitFullscreenElement
                  || document.mozFullScreenElement
                  || document.msFullscreenElement;
        if (!fsEl && isFullscreen) {
            AureliaControlCenter.exitFullscreen();
        }
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);

    // 2. keydown ESC：當瀏覽器原生全螢幕被拒、僅 CSS 假全屏時的 fallback
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isFullscreen) {
            e.preventDefault();
            AureliaControlCenter.exitFullscreen();
        }
    });

    console.log('✅ 控制中心模組 (v4.8.3 - 雙視窗路由架構) 已加載');

})(window.AureliaControlCenter = window.AureliaControlCenter || {});