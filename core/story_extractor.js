/**
 * Story Extractor (開場白提取器)
 * 把開場白整段渲染在單一區域（純文字 + HTML 區塊依原本順序堆疊）
 */

(function() {
    'use strict';

    const STYLE_ID = 'se-styles-v1';
    const THEME_STORAGE_KEY = 'story_extractor_theme';
    const THEMES = {
        light: 'light',
        darkgold: 'darkgold'
    };

    const StoryExtractor = {
        currentTheme: THEMES.light,
        isVisible: false,
        originalFormParent: null,    // 記住 #form_sheld 原本的家（hide 時還原）
        originalFormSibling: null,

        init() {
            this.loadTheme();
            this.injectStyles();
        },

        loadTheme() {
            try {
                const saved = localStorage.getItem(THEME_STORAGE_KEY);
                if (saved && (saved === THEMES.light || saved === THEMES.darkgold)) {
                    this.currentTheme = saved;
                }
            } catch (e) { console.error('主題讀取失敗', e); }
        },

        saveTheme() {
            localStorage.setItem(THEME_STORAGE_KEY, this.currentTheme);
        },

        toggleTheme() {
            this.currentTheme = this.currentTheme === THEMES.light ? THEMES.darkgold : THEMES.light;
            this.saveTheme();
            this.applyTheme();
            const themeBtn = document.getElementById('se-btn-theme');
            if (themeBtn) {
                themeBtn.textContent = this.currentTheme === THEMES.darkgold ? '☀️' : '🌙';
                themeBtn.title = this.currentTheme === THEMES.darkgold ? '切換到淺色模式' : '切換到黑金模式';
            }
        },

        applyTheme() {
            const root = document.getElementById('se-root-wrapper');
            if (root) {
                root.className = this.currentTheme === THEMES.darkgold ? 'theme-darkgold' : '';
            }
        },

        injectStyles() {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Roboto:wght@400;500;700&family=Cinzel:wght@400;700&display=swap');

                /* === 亮版（默認）：視差書咖風，對齊主大廳 === */
                #se-root-wrapper {
                    width: 100%; height: 100%; display: flex; flex-direction: column;
                    background: #EEF0F6; position: relative;
                    overflow: hidden; box-sizing: border-box;
                    font-family: 'Noto Sans TC', sans-serif;
                    color: #1A1C28;
                    background-image:
                        linear-gradient(rgba(26,28,40,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(26,28,40,0.04) 1px, transparent 1px);
                    background-size: 30px 30px;
                }

                #se-toolbar {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 0 15px;
                    background: rgba(228,232,245,0.92);
                    border-bottom: 1px solid rgba(26,28,40,0.10);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                    flex-shrink: 0; height: 50px;
                }
                .se-title { font-weight: 700; font-size: 16px; color: #1A1C28; letter-spacing: 2px; font-family: 'Noto Sans TC', sans-serif; }
                .se-controls { display: flex; gap: 8px; }
                .se-icon-btn {
                    border: none; background: transparent; cursor: pointer;
                    font-size: 18px; color:rgba(26,28,40,0.72); transition: all 0.2s;
                    width: 32px; height: 32px; border-radius: 50%;
                }
                .se-icon-btn:hover { color: #1A1C28; background: rgba(26,28,40,0.06); }

                #se-content-area {
                    flex: 1; position: relative; width: 100%;
                    overflow-y: auto; overflow-x: hidden;
                    background: transparent; min-height: 150px;
                    padding: 15px; box-sizing: border-box;
                }

                /* 純文字容器：套用書咖卡片裝飾 */
                #se-root-wrapper .native-render-wrapper {
                    color: #1A1C28; display: flow-root; width: 100%; margin-bottom: 15px;
                    background: rgba(228,232,245,0.60);
                    border: 1px solid rgba(26,28,40,0.09);
                    border-left: 2px solid rgba(26,28,40,0.25);
                    padding: 15px; border-radius: 4px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    font-size: calc(var(--mainFontSize, 16px) + 2px);
                    line-height: 1.7;
                }

                /* HTML 區塊容器：透明、只給間距，讓角色卡自帶樣式發光 */
                #se-root-wrapper .story-html-block {
                    width: 100%; margin-bottom: 15px;
                    display: flow-root;
                }

                /* 強制繼承：擋掉外部對 p/li/td 等的直接規則覆蓋（書咖預設或 ST 全域樣式） */
                #se-root-wrapper .native-render-wrapper * {
                    font-family: inherit !important;
                    color: inherit !important;
                }

                /* 吃掉瀏覽器對 <q> 標籤自動加的引號（避免跟原文裡的引號重複變成 ""…""） */
                #se-root-wrapper .native-render-wrapper q::before,
                #se-root-wrapper .native-render-wrapper q::after {
                    content: none !important;
                }
                #se-root-wrapper .native-render-wrapper p, #se-root-wrapper .native-render-wrapper li, #se-root-wrapper .native-render-wrapper td { color: #1A1C28; }
                #se-root-wrapper .native-render-wrapper h1, #se-root-wrapper .native-render-wrapper h2, #se-root-wrapper .native-render-wrapper h3 {
                    color: #1A1C28; border-bottom: 1px solid rgba(26,28,40,0.15);
                }
                #se-root-wrapper .native-render-wrapper svg text, #se-root-wrapper .native-render-wrapper .nodeLabel, #se-root-wrapper .native-render-wrapper .edgeLabel {
                    color: #1A1C28 !important; fill: #1A1C28 !important;
                }

                /* === 暗版：404 終端風（綠霓虹，對齊大廳 mode-404） === */
                #se-root-wrapper.theme-darkgold {
                    background: #000800;
                    color: #b8ffcb;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    background-image:
                        linear-gradient(rgba(0,255,65,0.08) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0,255,65,0.08) 1px, transparent 1px);
                    background-size: 30px 30px;
                }

                #se-root-wrapper.theme-darkgold #se-toolbar {
                    background: rgba(0,15,0,0.9);
                    border-bottom: 1px solid rgba(0,255,65,0.25);
                    box-shadow: 0 2px 8px rgba(0,255,65,0.05);
                }

                #se-root-wrapper.theme-darkgold .se-title {
                    color: #00ff41;
                    font-family: 'Consolas', monospace;
                    font-weight: 700;
                    letter-spacing: 2px;
                    text-shadow: 0 0 8px rgba(0,255,65,0.4);
                }

                #se-root-wrapper.theme-darkgold .se-icon-btn {
                    color: #00cc33;
                }

                #se-root-wrapper.theme-darkgold .se-icon-btn:hover {
                    color: #00ff41;
                    background: rgba(0,255,65,0.1);
                }

                #se-root-wrapper.theme-darkgold #se-content-area {
                    background: transparent;
                    color: #b8ffcb;
                }

                #se-root-wrapper.theme-darkgold .native-render-wrapper {
                    color: #b8ffcb;
                    background: rgba(0,15,0,0.7);
                    border: 1px solid rgba(0,255,65,0.2);
                    border-left: 2px solid rgba(0,255,65,0.5);
                    padding: 15px;
                    margin-bottom: 15px;
                    box-shadow: 0 2px 8px rgba(0,255,65,0.05);
                    border-radius: 4px;
                }

                #se-root-wrapper.theme-darkgold .native-render-wrapper p,
                #se-root-wrapper.theme-darkgold .native-render-wrapper li,
                #se-root-wrapper.theme-darkgold .native-render-wrapper td {
                    color: #b8ffcb;
                }

                #se-root-wrapper.theme-darkgold .native-render-wrapper h1,
                #se-root-wrapper.theme-darkgold .native-render-wrapper h2,
                #se-root-wrapper.theme-darkgold .native-render-wrapper h3 {
                    color: #00ff41;
                    border-bottom: 1px solid rgba(0,255,65,0.3);
                }

                /* === VN TAB 模式樣式（小窗口） === */
                #se-root-wrapper.vn-tab-mode {
                    font-size: 12px;
                }

                #se-root-wrapper.vn-tab-mode #se-toolbar {
                    height: 35px !important;
                    padding: 0 10px !important;
                    border-bottom: 1px solid #333;
                }

                #se-root-wrapper.vn-tab-mode .se-title {
                    font-size: 12px !important;
                }

                #se-root-wrapper.vn-tab-mode .se-icon-btn {
                    width: 28px !important;
                    height: 28px !important;
                    font-size: 14px !important;
                }

                #se-root-wrapper.vn-tab-mode #se-content-area {
                    padding: 8px !important;
                    font-size: 11px !important;
                }

                #se-root-wrapper.vn-tab-mode .native-render-wrapper {
                    padding: 10px !important;
                    margin-bottom: 10px !important;
                    font-size: 11px !important;
                }

                /* Story Extractor 容器样式 */
                #story-extractor-container-vn {
                    display: none;
                }

                #story-extractor-container-vn.show {
                    display: flex !important;
                }

                /* === 輸入區底座（劫持 #form_sheld 進來用） === */
                #se-root-wrapper #se-input-area {
                    flex-shrink: 0; width: 100%;
                    background: rgba(228,232,245,0.85);
                    border-top: 1px solid rgba(26,28,40,0.15);
                    z-index: 10; min-height: 50px;
                    box-sizing: border-box;
                }
                #se-root-wrapper #se-input-area #form_sheld {
                    position: relative !important;
                    bottom: auto !important; left: auto !important; right: auto !important;
                    width: 100% !important; max-width: 100% !important;
                    background: transparent !important;
                    box-shadow: none !important;
                    padding: 10px !important; margin: 0 !important;
                }
                /* 暗版：404 終端風的輸入區 */
                #se-root-wrapper.theme-darkgold #se-input-area {
                    background: rgba(0, 15, 0, 0.85);
                    border-top: 1px solid rgba(0, 255, 65, 0.25);
                }
            `;
            document.head.appendChild(style);
        },

        // 🔥 完全複製 html_extractor.js 的 show 方法
        show(targetContainer = null) {
            console.log('[StoryExtractor] 🔍 show() 被調用，當前狀態 isVisible:', this.isVisible);

            const vnExtractorContainer = document.getElementById('story-extractor-container-vn');
            let panelContainer = null;
            let iframeContainer = null;
            let isVnTabMode = false;

            if (targetContainer) {
                iframeContainer = targetContainer;
                panelContainer = targetContainer.parentElement;
            }
            else if (vnExtractorContainer) {
                iframeContainer = vnExtractorContainer;
                panelContainer = vnExtractorContainer;
                isVnTabMode = true;
            }
            else {
                panelContainer = document.getElementById('story-panel-container');
                iframeContainer = document.getElementById('story-iframe-container');
            }

            if (!panelContainer || !iframeContainer) {
                console.warn('[StoryExtractor] 容器缺失，正在嘗試修復...');
                const phoneScreen = document.getElementById('aurelia-phone-screen');

                if (phoneScreen) {
                    panelContainer = document.createElement('div');
                    panelContainer.id = 'story-panel-container';
                    panelContainer.style.cssText = `
                        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                        background: #EEF0F6; z-index: 50;
                        transform: translateX(100%); transition: transform 0.3s ease;
                        display: flex; flex-direction: column;
                    `;

                    const header = document.createElement('div');
                    header.style.cssText = `height: 40px; background: rgba(0,0,0,0.5); display: flex; align-items: center; padding: 0 15px; justify-content: space-between; color: white;`;
                    header.innerHTML = `
                        <div style="font-size:14px">📖 開場白提取</div>
                        <div style="cursor:pointer; padding:5px;" onclick="
                            this.closest('#story-panel-container').style.transform='translateX(100%)';
                            const home=document.getElementById('aurelia-home-tab');
                            if(home) home.style.display='flex';
                        ">✕</div>
                    `;

                    iframeContainer = document.createElement('div');
                    iframeContainer.id = 'story-iframe-container';
                    iframeContainer.style.cssText = `flex: 1; position: relative; background: #fcfcfc;`;

                    panelContainer.appendChild(header);
                    panelContainer.appendChild(iframeContainer);
                    phoneScreen.appendChild(panelContainer);
                    console.log('[StoryExtractor] 容器修復完成');
                } else {
                    return alert('無法定位手機介面 (aurelia-phone-screen)，請確認控制中心已開啟。');
                }
            }

            iframeContainer.innerHTML = '';

            const rootWrapper = document.createElement('div');
            rootWrapper.id = 'se-root-wrapper';
            if (isVnTabMode) {
                rootWrapper.className = 'vn-tab-mode';
            }
            rootWrapper.innerHTML = `
                <div id="se-toolbar" style="${isVnTabMode ? 'height: 35px; padding: 0 10px;' : ''}">
                    <div class="se-title" style="${isVnTabMode ? 'font-size: 13px;' : ''}">📖 踏入故事</div>
                    <div class="se-controls">
                        <button class="se-icon-btn" title="切換主題" id="se-btn-theme">🌙</button>
                        <button class="se-icon-btn" title="關閉" id="se-btn-close" style="color: #ff4444;">✕</button>
                        <button class="se-icon-btn" title="刷新" id="se-btn-refresh">↻</button>
                    </div>
                </div>
                <div id="se-content-area" style="${isVnTabMode ? 'padding: 8px; font-size: 12px;' : ''}"></div>
                <div id="se-input-area"></div>
            `;

            iframeContainer.appendChild(rootWrapper);

            if (isVnTabMode) {
                if (panelContainer) {
                    panelContainer.style.removeProperty('display');
                    panelContainer.classList.remove('hide');
                    panelContainer.classList.add('show');
                    panelContainer.style.setProperty('display', 'flex', 'important');
                }
            } else {
                panelContainer.style.pointerEvents = 'auto';
                panelContainer.style.display = 'flex';
                setTimeout(() => {
                    panelContainer.style.transform = 'translateX(0)';
                }, 10);

                const phoneScreen = document.getElementById('aurelia-phone-screen');
                if (phoneScreen) {
                    const homeTab = phoneScreen.querySelector('#aurelia-home-tab');
                    if (homeTab) homeTab.style.display = 'none';
                }
            }

            const backBtn = rootWrapper.querySelector('#se-btn-back');
            if (backBtn && !isVnTabMode) {
                backBtn.onclick = () => {
                    panelContainer.style.transform = 'translateX(100%)';
                };
            }

            const closeBtn = rootWrapper.querySelector('#se-btn-close');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    this.hide();
                };
            }

            rootWrapper.querySelector('#se-btn-refresh').onclick = () => this.scanAndRender();

            const themeBtn = rootWrapper.querySelector('#se-btn-theme');
            themeBtn.onclick = () => this.toggleTheme();
            themeBtn.textContent = this.currentTheme === THEMES.darkgold ? '☀️' : '🌙';
            themeBtn.title = this.currentTheme === THEMES.darkgold ? '切換到淺色模式' : '切換到黑金模式';

            this.applyTheme();
            this.isVisible = true;

            // DOM 劫持：把酒館主聊天的輸入框搬進來（mount 在 #chat 時不搬，跟 html_extractor 行為一致）
            try {
                const _mountSelector = window.extension_settings?.['多功能面板系統']?.mount?.selector || '#sheld';
                const formSheld = document.getElementById('form_sheld');
                if (formSheld && _mountSelector !== '#chat') {
                    this.originalFormParent = formSheld.parentNode;
                    this.originalFormSibling = formSheld.nextSibling;
                    rootWrapper.querySelector('#se-input-area').appendChild(formSheld);
                    console.log('[StoryExtractor] 已劫持 #form_sheld');
                }
            } catch (e) { console.warn('[StoryExtractor] 劫持 #form_sheld 失敗', e); }

            console.log('[StoryExtractor] ✅ 窗口已顯示');

            this.scanAndRender();
        },

        // 把開場白整段渲染進單一區域：純文字 + HTML 區塊依原本順序堆疊
        scanAndRender() {
            const contentArea = document.getElementById('se-content-area');
            contentArea.innerHTML = '';

            const firstMes = document.querySelector('#chat .mes[mesid="0"] .mes_text');

            if (!firstMes) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">📭</div>
                    找不到開場白<br><small>請先開啟一個角色卡對話</small>
                </div>`;
                return;
            }

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = firstMes.innerHTML;

            const BLOCK_TAGS = ['DIV', 'TABLE', 'FORM', 'DETAILS', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'FIELDSET', 'FIGURE', 'IFRAME', 'CANVAS', 'SVG'];

            let textBuffer = [];
            const flushText = () => {
                if (textBuffer.length === 0) return;
                const html = textBuffer.join('');
                if (html.replace(/<[^>]*>/g, '').trim()) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'native-render-wrapper';
                    wrapper.innerHTML = html;
                    contentArea.appendChild(wrapper);
                }
                textBuffer = [];
            };

            Array.from(tempDiv.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (node.textContent.trim()) textBuffer.push(node.textContent);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toUpperCase();
                    if (['SCRIPT', 'STYLE'].includes(tagName)) return;

                    if (BLOCK_TAGS.includes(tagName)) {
                        flushText();
                        const wrapper = document.createElement('div');
                        wrapper.className = 'story-html-block';
                        wrapper.innerHTML = node.outerHTML;
                        wrapper.querySelectorAll('details:not([open])').forEach(el => el.setAttribute('open', 'true'));
                        contentArea.appendChild(wrapper);
                    } else {
                        textBuffer.push(node.outerHTML);
                    }
                }
            });
            flushText();

            if (contentArea.children.length === 0) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">📭</div>
                    開場白內容為空
                </div>`;
                return;
            }

            this.fixIframes(contentArea);
            this.mimicAuthorStyle(contentArea);
            // iframe 載入慢（含內部 JS 觸發的 1.5s 過渡）→ 載完立刻補一次 + 1.6s 後再補一次最終態
            contentArea.querySelectorAll('iframe').forEach(iframe => {
                iframe.addEventListener('load', () => {
                    console.log('[StoryExtractor] iframe 載入完成，補偷學樣式');
                    this.mimicAuthorStyle(contentArea);
                    setTimeout(() => {
                        console.log('[StoryExtractor] iframe 載入後 1.6s，最終補正');
                        this.mimicAuthorStyle(contentArea);
                    }, 1600);
                }, { once: true });
            });
            console.log(`[StoryExtractor] ✅ 開場白渲染完成，共 ${contentArea.children.length} 個區塊`);
        },

        // 文字 wrapper 偷學作者 HTML 面板的視覺：背景、遮罩、文字色、邊框、圓角、陰影、字體
        // bg 捐贈者：第一個有底色或 bg-image 的可見元素
        // overlay 捐贈者：全屏絕對定位 + 半透明底色（疊在 bg 上的「夜色」遮罩）
        // 文字色捐贈者：第一個有直接文字內容的可見元素
        mimicAuthorStyle(contentArea) {
            const blocks = contentArea.querySelectorAll('.story-html-block');
            if (!blocks.length) return;

            let bgDonor = null;
            let overlayDonor = null;
            let textDonor = null;
            for (const block of blocks) {
                if (!bgDonor) bgDonor = this.findStyledDonor(block);
                if (!overlayDonor) overlayDonor = this.findOverlayDonor(block);
                if (!textDonor) textDonor = this.findTextDonor(block);
                if (bgDonor && overlayDonor && textDonor) break;
            }

            if (!bgDonor) {
                console.log('[StoryExtractor] 找不到 bg 捐贈者，保留書咖預設');
                return;
            }

            const bgCs = getComputedStyle(bgDonor);
            const overlayColor = overlayDonor ? getComputedStyle(overlayDonor).backgroundColor : null;
            const textColor = textDonor ? getComputedStyle(textDonor).color : bgCs.color;
            const fontFamily = textDonor ? getComputedStyle(textDonor).fontFamily : bgCs.fontFamily;

            console.log('[StoryExtractor] bg：', bgDonor.tagName, bgDonor.className || '(無)',
                '| overlay：', overlayColor || '(無)',
                '| 文字色：', textColor,
                '| 字體：', fontFamily,
                '| bgImage:', bgCs.backgroundImage.substring(0, 60));

            // 多重背景合成：overlay（整面色塊）疊在 image 上
            const composedBgImage = (overlayColor && bgCs.backgroundImage !== 'none')
                ? `linear-gradient(${overlayColor}, ${overlayColor}), ${bgCs.backgroundImage}`
                : bgCs.backgroundImage;

            contentArea.querySelectorAll('.native-render-wrapper').forEach(w => {
                w.style.backgroundColor = bgCs.backgroundColor;
                w.style.backgroundImage = composedBgImage;
                w.style.backgroundSize = bgCs.backgroundSize;
                w.style.backgroundPosition = bgCs.backgroundPosition;
                w.style.backgroundRepeat = bgCs.backgroundRepeat;
                w.style.color = textColor;
                w.style.borderTop = `${bgCs.borderTopWidth} ${bgCs.borderTopStyle} ${bgCs.borderTopColor}`;
                w.style.borderRight = `${bgCs.borderRightWidth} ${bgCs.borderRightStyle} ${bgCs.borderRightColor}`;
                w.style.borderBottom = `${bgCs.borderBottomWidth} ${bgCs.borderBottomStyle} ${bgCs.borderBottomColor}`;
                w.style.borderLeft = `${bgCs.borderLeftWidth} ${bgCs.borderLeftStyle} ${bgCs.borderLeftColor}`;
                w.style.borderRadius = bgCs.borderRadius;
                w.style.boxShadow = bgCs.boxShadow;
                w.style.fontFamily = fontFamily;
                w.style.padding = '15px';
            });
        },

        // 共用：判斷元素是否隱藏（含 opacity:0，避免採到夜模式被淡出的 day-bg 之類）
        _isHidden(el) {
            try {
                const cs = getComputedStyle(el);
                return cs.display === 'none' ||
                    cs.visibility === 'hidden' ||
                    parseFloat(cs.opacity || '1') < 0.05;
            } catch (e) { return false; }
        },

        // 共用：BFS wrapper 子樹，遇到 iframe 踩進 contentDocument，跳過隱藏元素
        // matchFn(el) 返回 true 即返回該元素
        _bfsFindFirst(wrapper, matchFn, maxDepth = 5) {
            if (!wrapper) return null;
            const queue = [];
            for (const child of wrapper.children) {
                queue.push({ el: child, depth: 0 });
            }
            while (queue.length) {
                const { el, depth } = queue.shift();
                if (!el || !el.tagName || this._isHidden(el)) continue;
                if (matchFn(el)) return el;
                if (depth >= maxDepth) continue;

                if (el.tagName === 'IFRAME') {
                    try {
                        const iframeDoc = el.contentDocument;
                        if (iframeDoc && iframeDoc.body) {
                            for (const child of iframeDoc.body.children) {
                                queue.push({ el: child, depth: depth + 1 });
                            }
                        }
                    } catch (e) { /* cross-origin */ }
                } else if (el.children) {
                    for (const child of el.children) {
                        queue.push({ el: child, depth: depth + 1 });
                    }
                }
            }
            return null;
        },

        // 找第一個有底色或 bg-image 的可見元素
        findStyledDonor(wrapper) {
            return this._bfsFindFirst(wrapper, (el) => {
                try {
                    const cs = getComputedStyle(el);
                    const hasBgColor = cs.backgroundColor &&
                        cs.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                        cs.backgroundColor !== 'transparent';
                    const hasBgImage = cs.backgroundImage && cs.backgroundImage !== 'none';
                    return hasBgColor || hasBgImage;
                } catch (e) { return false; }
            });
        },

        // 找第一個有直接文字內容的可見元素（用它的 color 當文字色）
        findTextDonor(wrapper) {
            return this._bfsFindFirst(wrapper, (el) => {
                for (const child of el.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                        return true;
                    }
                }
                return false;
            }, 7);
        },

        // 找遮罩層：position:absolute/fixed + 全屏 (top/bottom/left/right 至少對角=0) + 有半透明底色
        findOverlayDonor(wrapper) {
            return this._bfsFindFirst(wrapper, (el) => {
                try {
                    const cs = getComputedStyle(el);
                    if (cs.position !== 'absolute' && cs.position !== 'fixed') return false;
                    const bg = cs.backgroundColor;
                    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false;
                    // 全屏判定：對角邊都 0
                    const fullV = cs.top === '0px' && cs.bottom === '0px';
                    const fullH = cs.left === '0px' && cs.right === '0px';
                    return fullV && fullH;
                } catch (e) { return false; }
            }, 6);
        },

        fixIframes(container) {
            const iframes = container.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                const adjustHeight = () => {
                    try {
                        const doc = iframe.contentWindow?.document;
                        if (doc && doc.body) {
                            doc.querySelectorAll('details:not([open])').forEach(el => el.setAttribute('open', 'true'));
                            const realHeight = doc.body.scrollHeight;
                            if (realHeight > 0) iframe.style.height = (realHeight + 100) + 'px';
                            doc.body.style.overflow = 'hidden';
                        }
                    } catch (e) { iframe.style.height = '600px'; }
                };
                iframe.onload = () => {
                    adjustHeight();
                    try {
                        if (window.ResizeObserver) {
                            new ResizeObserver(() => adjustHeight()).observe(iframe.contentWindow.document.body);
                        } else { setInterval(adjustHeight, 500); }
                    } catch(e){}
                };
                if (iframe.contentWindow && iframe.contentWindow.document.readyState === 'complete') iframe.onload();
            });
        },

        hide() {
            console.log('[StoryExtractor] 🔍 hide() 被調用');

            // 還原 #form_sheld 回原本的家（最先做，避免後續 DOM 操作把它連帶清掉）
            try {
                const formSheld = document.getElementById('form_sheld');
                if (formSheld && this.originalFormParent) {
                    this.originalFormParent.insertBefore(formSheld, this.originalFormSibling);
                    this.originalFormParent = null;
                    this.originalFormSibling = null;
                    console.log('[StoryExtractor] 已還原 #form_sheld');
                }
            } catch (e) { console.warn('[StoryExtractor] 還原 #form_sheld 失敗', e); }

            const _maybeHideVnPanel = () => {
                const pageGame = document.getElementById('page-game');
                if (pageGame && pageGame.classList.contains('hidden')) {
                    if (window.AureliaControlCenter?.hideVnPanel) window.AureliaControlCenter.hideVnPanel();
                }
            };

            const vnExtractorContainer = document.getElementById('story-extractor-container-vn');
            if (vnExtractorContainer) {
                vnExtractorContainer.classList.remove('show');
                vnExtractorContainer.style.removeProperty('display');
                this.isVisible = false;
                _maybeHideVnPanel();
                return;
            }

            try {
                const parentDoc = window.parent && window.parent.document;
                if (parentDoc) {
                    const parentContainer = parentDoc.getElementById('story-extractor-container-vn');
                    if (parentContainer) {
                        parentContainer.classList.remove('show');
                        parentContainer.style.removeProperty('display');
                        this.isVisible = false;
                        _maybeHideVnPanel();
                        return;
                    }
                }
            } catch (e) {}

            const panelContainer = document.getElementById('story-panel-container');
            if (panelContainer) {
                panelContainer.style.transform = 'translateX(100%)';
                this.isVisible = false;
            }
        }
    };

    StoryExtractor.init();
    window.StoryExtractor = StoryExtractor;
    console.log('✅ Story Extractor (開場白提取器) 已啟動');
})();
