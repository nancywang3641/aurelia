/**
 * Story Extractor (開場白提取器)
 * 自動把開場白中的每個 HTML 區塊變成獨立 TAB
 * TAB 名稱自動從內容中提取（title、h1-h6、header 等）
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
        activeTab: '',
        currentTheme: THEMES.light,
        isVisible: false,

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

                /* === 淺色主題（默認） === */
                #se-root-wrapper {
                    width: 100%; height: 100%; display: flex; flex-direction: column;
                    background: #fcfcfc; position: relative;
                    overflow: hidden; box-sizing: border-box; font-family: 'Roboto', sans-serif;
                    color: #333;
                }

                #se-toolbar {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 0 15px; background: #fff; border-bottom: 1px solid #eee;
                    flex-shrink: 0; height: 50px;
                }
                .se-title { font-weight: 700; font-size: 16px; color: #444; letter-spacing: 2px; font-family: 'Playfair Display', serif; }
                .se-controls { display: flex; gap: 8px; }
                .se-icon-btn {
                    border: none; background: transparent; cursor: pointer;
                    font-size: 18px; color: #999; transition: all 0.2s;
                    width: 32px; height: 32px; border-radius: 50%;
                }
                .se-icon-btn:hover { color: #333; background: #f0f0f0; }

                #se-tab-bar {
                    display: flex; gap: 15px; padding: 0 15px; background: #fff;
                    border-bottom: 1px solid #eee; overflow-x: auto; flex-shrink: 0;
                }
                #se-tab-bar::-webkit-scrollbar { display: none; }

                .se-tab-item {
                    padding: 12px 0; font-size: 13px; color: #888; cursor: pointer;
                    border-bottom: 2px solid transparent; transition: all 0.2s;
                    white-space: nowrap; font-weight: 500; text-transform: uppercase;
                }
                .se-tab-item.active { color: #222; border-bottom-color: #222; font-weight: 700; }

                #se-content-area { flex: 1; position: relative; width: 100%; overflow-y: auto; overflow-x: hidden; background: #fcfcfc; min-height: 150px; }

                .se-tab-pane { width: 100%; min-height: 100%; padding: 15px; box-sizing: border-box; display: none; }
                .se-tab-pane.active { display: block; }

                /* 強制內容樣式修正 */
                #se-root-wrapper .native-render-wrapper { color: #1a1a1a; display: flow-root; width: 100%; margin-bottom: 15px; }
                #se-root-wrapper .native-render-wrapper p, #se-root-wrapper .native-render-wrapper li, #se-root-wrapper .native-render-wrapper td { color: #1a1a1a; }
                #se-root-wrapper .native-render-wrapper svg text, #se-root-wrapper .native-render-wrapper .nodeLabel, #se-root-wrapper .native-render-wrapper .edgeLabel {
                    color: #eee !important; fill: #eee !important;
                }

                /* === 黑金主題 === */
                #se-root-wrapper.theme-darkgold {
                    background: #0a0a0a;
                    color: #e6e6e6;
                    font-family: 'Cinzel', 'Microsoft YaHei', sans-serif;
                }

                #se-root-wrapper.theme-darkgold #se-toolbar {
                    background: #111111;
                    border-bottom: 1px solid #333;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                }

                #se-root-wrapper.theme-darkgold .se-title {
                    color: #d4af37;
                    font-family: 'Cinzel', serif;
                    text-shadow: 0 0 8px rgba(212, 175, 55, 0.4);
                }

                #se-root-wrapper.theme-darkgold .se-icon-btn {
                    color: #888;
                }

                #se-root-wrapper.theme-darkgold .se-icon-btn:hover {
                    color: #d4af37;
                    background: rgba(212, 175, 55, 0.1);
                }

                #se-root-wrapper.theme-darkgold #se-tab-bar {
                    background: #0a0a0a;
                    border-bottom: 1px solid #333;
                }

                #se-root-wrapper.theme-darkgold .se-tab-item {
                    color: #666;
                }

                #se-root-wrapper.theme-darkgold .se-tab-item.active {
                    color: #d4af37;
                    border-bottom-color: #d4af37;
                    text-shadow: 0 0 8px rgba(212, 175, 55, 0.4);
                }

                #se-root-wrapper.theme-darkgold #se-content-area {
                    background: #0a0a0a;
                }

                #se-root-wrapper.theme-darkgold .se-tab-pane {
                    background: #0a0a0a;
                    color: #e6e6e6;
                }

                #se-root-wrapper.theme-darkgold .native-render-wrapper {
                    color: #e6e6e6;
                    background: #111111;
                    border: 1px solid #333;
                    border-left: 2px solid #7a6020;
                    padding: 15px;
                    margin-bottom: 15px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                }

                #se-root-wrapper.theme-darkgold .native-render-wrapper p,
                #se-root-wrapper.theme-darkgold .native-render-wrapper li,
                #se-root-wrapper.theme-darkgold .native-render-wrapper td {
                    color: #e6e6e6;
                }

                #se-root-wrapper.theme-darkgold .native-render-wrapper h1,
                #se-root-wrapper.theme-darkgold .native-render-wrapper h2,
                #se-root-wrapper.theme-darkgold .native-render-wrapper h3 {
                    color: #d4af37;
                    border-bottom: 1px solid #7a6020;
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

                #se-root-wrapper.vn-tab-mode #se-tab-bar {
                    padding: 0 10px !important;
                    height: 35px;
                }

                #se-root-wrapper.vn-tab-mode .se-tab-item {
                    padding: 8px 0 !important;
                    font-size: 11px !important;
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
                        background: #1a1a1a; z-index: 50;
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
                <div id="se-tab-bar" style="${isVnTabMode ? 'padding: 0 10px;' : ''}"></div>
                <div id="se-content-area" style="${isVnTabMode ? 'padding: 8px; font-size: 12px;' : ''}"></div>
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
            console.log('[StoryExtractor] ✅ 窗口已顯示');

            this.scanAndRender();
        },

        // 🔥 自動把每個頂層 HTML 區塊變成獨立 TAB，自動提取標題
        // 純文字開場白 → 直接顯示為一個 TAB（不拆分）
        // 文字 + HTML 混合 → 文字一個 TAB，每個 HTML 區塊各一個 TAB
        scanAndRender() {
            const contentArea = document.getElementById('se-content-area');
            const tabBar = document.getElementById('se-tab-bar');

            contentArea.innerHTML = '';
            tabBar.innerHTML = '';

            // 🔥 獲取 mesid="0" 的第一條消息
            const firstMes = document.querySelector('#chat .mes[mesid="0"] .mes_text');

            if (!firstMes) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">📭</div>
                    找不到開場白<br><small>請先開啟一個角色卡對話</small>
                </div>`;
                return;
            }

            // 🔥 解析內容
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = firstMes.innerHTML;

            // 🔥 定義「有意義的 HTML 容器」（值得獨立成 TAB 的元素）
            const BLOCK_TAGS = ['DIV', 'TABLE', 'FORM', 'DETAILS', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'FIELDSET', 'FIGURE', 'IFRAME', 'CANVAS', 'SVG'];

            const tabs = [];
            let textContent = []; // 累積非區塊內容

            // 🔥 遍歷所有子節點，區分文字和 HTML 區塊
            Array.from(tempDiv.childNodes).forEach((node, index) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    // 純文字節點
                    const text = node.textContent.trim();
                    if (text) {
                        textContent.push(node.textContent);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toUpperCase();

                    // 跳過 script、style
                    if (['SCRIPT', 'STYLE'].includes(tagName)) {
                        return;
                    }

                    // 🔥 如果是容器元素，獨立成 TAB
                    if (BLOCK_TAGS.includes(tagName)) {
                        // 先把之前累積的文字內容存起來（稍後處理）
                        tabs.push({
                            id: `html-${index}`,
                            name: this.extractTabName(node, tabs.length),
                            html: `<div class="native-render-wrapper">${node.outerHTML}</div>`,
                            isHtml: true
                        });
                    } else {
                        // 非容器元素（P、SPAN、BR、HR 等），累積到文字內容
                        textContent.push(node.outerHTML);
                    }
                }
            });

            // 🔥 如果有文字內容，創建一個「文字」TAB（放在最前面）
            if (textContent.length > 0) {
                const textHtml = textContent.join('');
                // 只有在文字內容有實際內容時才創建
                if (textHtml.replace(/<[^>]*>/g, '').trim()) {
                    tabs.unshift({
                        id: 'text-content',
                        name: '📝 開場白',
                        html: `<div class="native-render-wrapper">${textHtml}</div>`,
                        isHtml: false
                    });
                }
            }

            // 🔥 如果沒有任何 TAB，顯示空提示
            if (tabs.length === 0) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">📭</div>
                    開場白內容為空
                </div>`;
                tabBar.style.display = 'none';
                return;
            }

            // 🔥 如果只有一個 TAB，隱藏分頁欄
            if (tabs.length === 1) {
                tabBar.style.display = 'none';
            } else {
                tabBar.style.display = 'flex';
            }

            // 🔥 創建所有 TAB
            tabs.forEach(tab => {
                this.createTab(tab.id, tab.name, tab.html);
            });

            // 激活第一個 TAB
            this.activeTab = tabs[0].id;
            this.switchTab(this.activeTab);

            console.log(`[StoryExtractor] ✅ 開場白已分為 ${tabs.length} 個 TAB`);
        },

        // 🔥 自動從元素中提取標題作為 TAB 名稱
        extractTabName(element, index) {
            // 1. 嘗試找 title 屬性
            if (element.getAttribute('title')) {
                return this.truncateName(element.getAttribute('title'));
            }

            // 2. 嘗試找 data-title 屬性
            if (element.getAttribute('data-title')) {
                return this.truncateName(element.getAttribute('data-title'));
            }

            // 3. 嘗試找 h1-h6 標題
            const heading = element.querySelector('h1, h2, h3, h4, h5, h6');
            if (heading && heading.textContent.trim()) {
                return this.truncateName(heading.textContent.trim());
            }

            // 4. 嘗試找 .title, .header, .heading 類
            const titleEl = element.querySelector('.title, .header, .heading, [class*="title"], [class*="header"]');
            if (titleEl && titleEl.textContent.trim()) {
                return this.truncateName(titleEl.textContent.trim());
            }

            // 5. 嘗試找 legend（for fieldset）
            const legend = element.querySelector('legend');
            if (legend && legend.textContent.trim()) {
                return this.truncateName(legend.textContent.trim());
            }

            // 6. 嘗試找 caption（for table）
            const caption = element.querySelector('caption');
            if (caption && caption.textContent.trim()) {
                return this.truncateName(caption.textContent.trim());
            }

            // 7. 嘗試用元素的 id 或 class 作為名稱
            if (element.id) {
                return this.formatClassName(element.id);
            }
            if (element.className && typeof element.className === 'string') {
                const firstClass = element.className.split(' ')[0];
                if (firstClass) {
                    return this.formatClassName(firstClass);
                }
            }

            // 8. 使用標籤名 + 索引作為備用名稱
            const tagIcons = {
                'DIV': '📦',
                'TABLE': '📊',
                'FORM': '📝',
                'UL': '📋',
                'OL': '📋',
                'DETAILS': '📂',
                'SECTION': '📑',
                'ARTICLE': '📰',
                'NAV': '🧭',
                'ASIDE': '📌',
                'IFRAME': '🖼️',
                'CANVAS': '🎨',
                'SVG': '🎨'
            };
            const icon = tagIcons[element.tagName] || '📄';
            return `${icon} 區塊 ${index + 1}`;
        },

        // 🔥 截斷過長的名稱
        truncateName(name) {
            const maxLength = 15;
            if (name.length > maxLength) {
                return name.substring(0, maxLength) + '...';
            }
            return name;
        },

        // 🔥 格式化 class/id 名稱（把 kebab-case 或 snake_case 轉成可讀形式）
        formatClassName(name) {
            return name
                .replace(/[-_]/g, ' ')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ')
                .substring(0, 15);
        },

        // 🔥 執行動態插入的腳本
        executeScripts(container) {
            const scripts = container.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                // 複製所有屬性
                Array.from(oldScript.attributes).forEach(attr => {
                    newScript.setAttribute(attr.name, attr.value);
                });
                // 複製腳本內容
                newScript.textContent = oldScript.textContent;
                // 替換舊腳本
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        },

        createTab(id, name, contentHtml) {
            const tabBar = document.getElementById('se-tab-bar');
            const contentArea = document.getElementById('se-content-area');

            const btn = document.createElement('div');
            btn.className = 'se-tab-item';
            btn.id = `se-tab-btn-${id}`;
            btn.textContent = name;
            btn.onclick = () => this.switchTab(id);
            tabBar.appendChild(btn);

            const pane = document.createElement('div');
            pane.className = 'se-tab-pane';
            pane.id = `se-tab-pane-${id}`;
            pane.innerHTML = contentHtml;

            pane.querySelectorAll('details:not([open])').forEach(el => {
                el.setAttribute('open', 'true');
            });

            contentArea.appendChild(pane);
        },

        switchTab(id) {
            this.activeTab = id;
            document.querySelectorAll('.se-tab-item').forEach(b => b.classList.remove('active'));
            const btn = document.getElementById(`se-tab-btn-${id}`);
            if(btn) btn.classList.add('active');

            document.querySelectorAll('.se-tab-pane').forEach(p => p.classList.remove('active'));
            const pane = document.getElementById(`se-tab-pane-${id}`);
            if(pane) {
                pane.classList.add('active');
                this.fixIframes(pane);
            }
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
