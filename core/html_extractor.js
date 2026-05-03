/**
 * 奧瑞亞檔案庫 (Aurelia Archives) - V11.5 (PhoneOS UI 終極純淨版 + 全通用插件支援 + 終端輸入遷移)
 * Update:
 * 1. [核心升級] 完全依賴 TH-render 自動攔截與 <title> 隱藏代碼解析命名。
 * 2. [極簡化] 廢除所有手動設定規則的 UI 與儲存邏輯，實現「零設定」全自動分類。
 * 3. [防漏機制] 未被 TH-render 捕捉的其餘有效 HTML 標籤，將自動歸入分類。
 * 4. [全通用插件支援] 無差別解開被 <p> 標籤錯誤包裹的所有第三方 DOM 結構，自動歸類。
 * 5. [DOM 劫持] 針對全螢幕模式新增 #form_sheld 動態遷移機制，確保輸入功能存活。
 */

(function() {
    'use strict';

    const STYLE_ID = 'ue-styles-v12-1';

    const UniversalExtractor = {
        activeTab: '', isVisible: false,
        originalFormParent: null, originalFormSibling: null, // 用於記錄輸入框原本的家

        init() {
            this.injectStyles();
            if (!window.getIframeName) window.getIframeName = () => 'aurelia-native-render';
            if (!window.eventClearAll) window.eventClearAll = () => {};
        },

        _getVnBgImage() {
            try {
                const gameBg = document.getElementById('game-bg');
                if (gameBg) {
                    const bg = gameBg.style.backgroundImage;
                    if (bg && bg !== 'none' && bg !== '') return bg; 
                }
            } catch (e) {}
            return null;
        },

        injectStyles() {
            const doc = (window.parent && window.parent.document) ? window.parent.document : document;
            if (doc.getElementById(STYLE_ID)) return;
            const style = doc.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Noto+Serif+TC:wght@400;500;700&display=swap');

                #aurelia-extractor-phone-overlay {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    z-index: 9999;
                    background-color: #080604;
                    background-size: cover; background-position: center; background-repeat: no-repeat;
                    transform: translateY(100%);
                    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                    display: flex; flex-direction: column; overflow: hidden;
                }
                #aurelia-extractor-phone-overlay.show { transform: translateY(0); }

                #aurelia-extractor-phone-overlay::before {
                    content: ''; position: absolute; inset: 0;
                    background: linear-gradient(180deg, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.88) 55%, rgba(0,0,0,0.94) 100%);
                    z-index: 0; pointer-events: none;
                }

                #ue-root-wrapper {
                    position: relative; z-index: 1;
                    width: 100%; height: 100%; display: flex; flex-direction: column;
                    background: transparent; box-sizing: border-box;
                    font-family: 'Noto Serif TC', 'Cinzel', serif; color: #e8dfc8;
                }

                #ue-toolbar {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 0 16px;
                    background: rgba(5, 4, 2, 0.55);
                    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
                    border-bottom: 1px solid rgba(212, 175, 55, 0.22);
                    flex-shrink: 0; height: 52px;
                }
                .ue-title {
                    font-weight: 700; font-size: 13px; color: #d4af37;
                    letter-spacing: 4px; font-family: 'Cinzel', serif;
                    text-shadow: 0 0 14px rgba(212, 175, 55, 0.45);
                    text-transform: uppercase;
                }
                .ue-controls { display: flex; gap: 4px; align-items: center; }
                .ue-icon-btn {
                    border: none; background: transparent; cursor: pointer;
                    font-size: 17px; color: rgba(212, 175, 55, 0.5);
                    transition: all 0.18s; width: 34px; height: 34px; border-radius: 6px;
                    display: flex; align-items: center; justify-content: center;
                }
                .ue-icon-btn:hover { color: #d4af37; background: rgba(212, 175, 55, 0.1); }

                #ue-tab-bar {
                    display: flex; gap: 0; padding: 0 12px;
                    background: rgba(3, 2, 1, 0.5);
                    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                    border-bottom: 1px solid rgba(212, 175, 55, 0.14);
                    overflow-x: auto; flex-shrink: 0;
                }
                #ue-tab-bar::-webkit-scrollbar { display: none; }
                .ue-tab-item {
                    padding: 11px 14px;
                    font-size: 10px; color: rgba(200, 178, 130, 0.45);
                    cursor: pointer; border-bottom: 2px solid transparent;
                    transition: all 0.18s; white-space: nowrap;
                    font-weight: 600; text-transform: uppercase; letter-spacing: 2px;
                    font-family: 'Cinzel', serif;
                }
                .ue-tab-item:hover:not(.active) { color: rgba(212, 175, 55, 0.65); }
                .ue-tab-item.active {
                    color: #d4af37; border-bottom-color: #d4af37;
                    text-shadow: 0 0 8px rgba(212, 175, 55, 0.38);
                }

                #ue-content-area {
                    flex: 1; position: relative; width: 100%;
                    overflow-y: auto; overflow-x: hidden; background: transparent;
                }
                #ue-content-area::-webkit-scrollbar { width: 3px; }
                #ue-content-area::-webkit-scrollbar-track { background: transparent; }
                #ue-content-area::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.28); border-radius: 2px; }

                .ue-tab-pane { width: 100%; min-height: 100%; padding: 16px; box-sizing: border-box; display: none; }
                .ue-tab-pane.active { display: block; }

                .native-render-wrapper {
                    color: #e8dfc8; display: flow-root; width: 100%; margin-bottom: 16px;
                    background: transparent; padding: 0; box-sizing: border-box;
                }
                .native-render-wrapper p, .native-render-wrapper li, .native-render-wrapper td { color: #e8dfc8; }
                .native-render-wrapper h1, .native-render-wrapper h2, .native-render-wrapper h3 { color: #d4af37; }
                .native-render-wrapper a { color: rgba(212,175,55,0.8); }
                .native-render-wrapper table { border-collapse: collapse; width: 100%; }
                .native-render-wrapper th { color: #d4af37; border-bottom: 1px solid rgba(212,175,55,0.3); padding: 6px 8px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
                .native-render-wrapper td { border-bottom: 1px solid rgba(255,255,255,0.06); padding: 6px 8px; font-size: 12px; }
                .native-render-wrapper * { border-left: none !important; }
                .native-render-wrapper *[style] { border-left: none !important; }
                
                .ue-md-table { width:100%; border-collapse:collapse; font-size:12px; margin:8px 0; }
                .ue-md-table th { background:rgba(212,175,55,0.12); color:#d4af37; padding:7px 10px; text-align:left; border-bottom:1px solid rgba(212,175,55,0.3); font-family:'Cinzel',serif; letter-spacing:1px; font-size:11px; }
                .ue-md-table td { padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.06); color:#e8dfc8; vertical-align:top; }
                .ue-md-table tr:hover td { background:rgba(212,175,55,0.05); }

                /* === 輸入區底座 === */
                #ue-input-area {
                    flex-shrink: 0; width: 100%;
                    background: rgba(3, 2, 1, 0.75);
                    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                    border-top: 1px solid rgba(212, 175, 55, 0.25);
                    z-index: 10; min-height: 50px;
                }
                /* 強制洗掉原版絕對定位與多餘樣式 */
                #ue-input-area #form_sheld {
                    position: relative !important;
                    bottom: auto !important; left: auto !important; right: auto !important;
                    width: 100% !important; max-width: 100% !important;
                    background: transparent !important;
                    box-shadow: none !important; padding: 10px !important; margin: 0 !important;
                }
            `;
            doc.head.appendChild(style);
        },

        show() {
            console.log('[Extractor] 🔍 show() 被調用');
            const win = window.parent || window;
            const doc = win.document || document;

            const vnTabContainer = doc.getElementById('aurelia-extractor-container-vn');
            let parentEl = vnTabContainer;
            const isVnTab = !!vnTabContainer;

            if (!parentEl) {
                const phoneFrame = doc.getElementById('phone-frame-hardware');
                if (!phoneFrame) {
                    return alert('找不到顯示目標！請確認 VN 面板或手機系統已開啟。');
                }
                parentEl = phoneFrame.querySelector('.phone-screen');
                if (!parentEl) return;
            }

            if (isVnTab) {
                parentEl.style.display = 'flex';
            }

            let overlay = parentEl.querySelector('#aurelia-extractor-phone-overlay');
            if (!overlay) {
                overlay = doc.createElement('div');
                overlay.id = 'aurelia-extractor-phone-overlay';
                parentEl.appendChild(overlay);
            }

            const vnBg = this._getVnBgImage();
            overlay.style.backgroundImage = vnBg || 'none';

            overlay.innerHTML = `
                <div id="ue-root-wrapper">
                    <div id="ue-toolbar">
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <button class="ue-icon-btn" title="返回" id="ue-btn-close" style="font-size: 28px; line-height: 1; margin-left: -8px;">‹</button>
                            <div class="ue-title">Aurealis Core</div>
                        </div>
                        <div class="ue-controls">
                            <button class="ue-icon-btn" title="重新讀取" id="ue-btn-refresh">↻</button>
                        </div>
                    </div>
                    <div id="ue-tab-bar"></div>
                    <div id="ue-content-area"></div>
                    <div id="ue-input-area"></div>
                </div>
            `;

            const rootWrapper = overlay.querySelector('#ue-root-wrapper');
            rootWrapper.querySelector('#ue-btn-close').onclick = () => this.hide();
            const tabBar = rootWrapper.querySelector('#ue-tab-bar');
            tabBar.addEventListener('wheel', (e) => {
                e.preventDefault();
                tabBar.scrollLeft += e.deltaY || e.deltaX;
            }, { passive: false });
            rootWrapper.querySelector('#ue-btn-refresh').onclick = () => {
                const freshBg = this._getVnBgImage();
                if (freshBg) overlay.style.backgroundImage = freshBg;
                this.scanAndRender();
            };

            // 執行 DOM 劫持：把 form_sheld 搬過來（#chat 模式下跳過）
            const _mountSelector = window.extension_settings?.['多功能面板系統']?.mount?.selector || '#sheld';
            const formSheld = doc.getElementById('form_sheld');
            if (formSheld && _mountSelector !== '#chat') {
                this.originalFormParent = formSheld.parentNode;
                this.originalFormSibling = formSheld.nextSibling;
                rootWrapper.querySelector('#ue-input-area').appendChild(formSheld);
            }

            void overlay.offsetWidth;
            overlay.classList.add('show');
            this.isVisible = true;

            this.scanAndRender();
        },

        hide() {
            const win = window.parent || window;
            const doc = win.document || document;
            const overlay = doc.getElementById('aurelia-extractor-phone-overlay');

            if (overlay) {
                // 面板關閉時，把 form_sheld 丟回原本的 DOM 樹
                const formSheld = doc.getElementById('form_sheld');
                if (formSheld && this.originalFormParent) {
                    this.originalFormParent.insertBefore(formSheld, this.originalFormSibling);
                    this.originalFormParent = null;
                    this.originalFormSibling = null;
                }

                overlay.classList.remove('show');
                this.isVisible = false;

                const vnTabContainer = doc.getElementById('aurelia-extractor-container-vn');
                if (vnTabContainer && vnTabContainer.contains(overlay)) {
                    setTimeout(() => { vnTabContainer.style.display = 'none'; }, 360);
                }

                console.log('[Extractor] ✅ 面板已關閉');
            }
        },

        scanAndRender() {
            const win = window.parent || window;
            const doc = win.document || document;
            
            const overlay = doc.getElementById('aurelia-extractor-phone-overlay');
            if(!overlay) return;

            const contentArea = overlay.querySelector('#ue-content-area');
            const tabBar = overlay.querySelector('#ue-tab-bar');
            
            contentArea.innerHTML = '';
            tabBar.innerHTML = '';
            
            const extractedData = {}; 
            let tabOrder = []; 

            const lastMes = doc.querySelector('#chat .mes.last_mes .mes_text');
            
            if (!lastMes) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">📭</div>無對話數據。
                </div>`;
                return;
            }

            const tempMesDiv = doc.createElement('div');
            tempMesDiv.innerHTML = lastMes.innerHTML;
            
            const ALLOWED_TAGS = ['DIV', 'TABLE', 'IFRAME', 'SCRIPT', 'STYLE', 'CANVAS', 'SVG', 'SECTION', 'ASIDE', 'NAV', 'HEADER', 'FOOTER', 'UL', 'OL', 'DL', 'FORM', 'DETAILS'];

            const pTags = Array.from(tempMesDiv.querySelectorAll('p'));
            pTags.forEach(p => {
                Array.from(p.children).forEach(child => {
                    if (ALLOWED_TAGS.includes(child.tagName.toUpperCase())) {
                        p.parentNode.insertBefore(child, p);
                    }
                });
                if (p.textContent.trim() === '' && p.children.length === 0) {
                    p.remove();
                }
            });

            const thRenders = Array.from(tempMesDiv.querySelectorAll('.TH-render'));
            thRenders.forEach((thNode, index) => {
                let panelName = '自定義面板';
                const codeBlock = thNode.querySelector('code.custom-language-html');
                if (codeBlock) {
                    const rawHtml = codeBlock.innerText || codeBlock.textContent;
                    const titleMatch = rawHtml.match(/<title>(.*?)<\/title>/i);
                    if (titleMatch && titleMatch[1]) {
                        panelName = titleMatch[1].trim();
                    }
                }

                const panelId = 'th_panel_' + index;

                if (!extractedData[panelId]) {
                    extractedData[panelId] = { name: panelName, html: [] };
                    tabOrder.push(panelId);
                }

                extractedData[panelId].html.push(`<div class="native-render-wrapper">${thNode.outerHTML}</div>`);
                thNode.remove();
            });

            const othersHtml = [];
            Array.from(tempMesDiv.children).forEach(el => {
                if (ALLOWED_TAGS.includes(el.tagName.toUpperCase())) {
                    othersHtml.push(`<div class="native-render-wrapper">${el.outerHTML}</div>`);
                }
            });

            if (othersHtml.length > 0) {
                if (!extractedData['others']) { 
                    extractedData['others'] = { name: '其他擴展與物件', html: [] }; 
                    tabOrder.push('others'); 
                }
                extractedData['others'].html = othersHtml;
            }

            if (tabOrder.length === 0) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">🔍</div>
                    未提取到符合規格的內容或面板。
                </div>`;
                return;
            }

            tabOrder.forEach(id => {
                this.createTab(id, extractedData[id].name, extractedData[id].html.join(''));
            });

            if (!this.activeTab || !tabOrder.includes(this.activeTab)) {
                this.activeTab = tabOrder[0];
            }
            this.switchTab(this.activeTab);
        },

        createTab(id, name, contentHtml) {
            const win = window.parent || window;
            const doc = win.document || document;
            const overlay = doc.getElementById('aurelia-extractor-phone-overlay');
            if(!overlay) return;

            const tabBar = overlay.querySelector('#ue-tab-bar');
            const contentArea = overlay.querySelector('#ue-content-area');

            const btn = doc.createElement('div');
            btn.className = 'ue-tab-item';
            btn.id = `tab-btn-${id}`;
            btn.textContent = name;
            btn.onclick = () => this.switchTab(id);
            tabBar.appendChild(btn);

            const pane = doc.createElement('div');
            pane.className = 'ue-tab-pane';
            pane.id = `tab-pane-${id}`;
            pane.innerHTML = contentHtml;

            pane.querySelectorAll('details:not([open])').forEach(el => el.setAttribute('open', 'true'));
            contentArea.appendChild(pane);
        },

        switchTab(id) {
            const win = window.parent || window;
            const doc = win.document || document;
            const overlay = doc.getElementById('aurelia-extractor-phone-overlay');
            if(!overlay) return;

            this.activeTab = id;
            overlay.querySelectorAll('.ue-tab-item').forEach(b => b.classList.remove('active'));
            const btn = overlay.querySelector(`#tab-btn-${id}`);
            if(btn) btn.classList.add('active');

            overlay.querySelectorAll('.ue-tab-pane').forEach(p => p.classList.remove('active'));
            const pane = overlay.querySelector(`#tab-pane-${id}`);
            if(pane) {
                pane.classList.add('active');
                this.fixIframes(pane);
                this._processMarkdownTables(pane);
                this._processMermaid(pane);
            }
        },

        fixIframes(container) {
            container.querySelectorAll('iframe').forEach(iframe => {
                const adjustHeight = () => {
                    try {
                        const doc = iframe.contentWindow?.document;
                        if (doc && doc.body) {
                            doc.querySelectorAll('details:not([open])').forEach(el => el.setAttribute('open', 'true'));
                            if (doc.body.scrollHeight > 0) iframe.style.height = (doc.body.scrollHeight + 100) + 'px';
                            doc.body.style.overflow = 'hidden';
                        }
                    } catch (e) { iframe.style.height = '600px'; }
                };
                iframe.onload = () => { adjustHeight(); try { if (window.ResizeObserver) new ResizeObserver(adjustHeight).observe(iframe.contentWindow.document.body); } catch(e){} };
            });
        },

        _processMarkdownTables(container) {
            const candidates = container.querySelectorAll('p, div, pre, td, li');
            candidates.forEach(el => {
                if (el.children.length > 0) return;
                const text = el.innerText || el.textContent || '';
                if (!text.includes('|')) return;
                const lines = text.split('\n').map(l => l.trim()).filter(l => l);
                const sepIdx = lines.findIndex(l => /^\|?[\s\-:]+\|/.test(l));
                if (sepIdx < 1) return;

                const headers = lines[sepIdx - 1].split('|').map(s => s.trim()).filter(s => s);
                const rows = lines.slice(sepIdx + 1)
                    .filter(l => l.startsWith('|') || l.includes('|'))
                    .map(l => l.split('|').map(s => s.trim()).filter(s => s));
                if (!headers.length || !rows.length) return;

                const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
                const tbody = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
                const tableHtml = `<table class="ue-md-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
                el.outerHTML = tableHtml;
            });
        },

        async _processMermaid(container) {
            const MERMAID_KEYWORDS = /^\s*(graph\s+(TD|LR|RL|BT|TB)|flowchart\s+|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie\s+title|gitGraph)/i;
            const blocks = [];

            container.querySelectorAll('code.language-mermaid, pre.mermaid').forEach(el => blocks.push(el));

            container.querySelectorAll('pre, div.mermaid').forEach(el => {
                if (blocks.includes(el)) return;
                const t = el.textContent || '';
                if (MERMAID_KEYWORDS.test(t)) blocks.push(el);
            });

            container.querySelectorAll('p, div').forEach(el => {
                if (blocks.includes(el) || el.querySelector('table,iframe,img,svg')) return;
                const t = (el.innerText || el.textContent || '').trim();
                if (MERMAID_KEYWORDS.test(t)) blocks.push(el);
            });

            if (!blocks.length) return;

            if (!window.mermaid) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
                    s.onload = resolve; s.onerror = reject;
                    document.head.appendChild(s);
                }).catch(() => null);
                if (!window.mermaid) return; 
                window.mermaid.initialize({ startOnLoad: false, theme: 'dark',
                    themeVariables: { primaryColor: '#1a1a1a', primaryTextColor: '#d4af37',
                        primaryBorderColor: '#d4af37', lineColor: '#888', background: '#0a0a0a' } });
            }

            for (const el of blocks) {
                try {
                    const code = (el.innerText || el.textContent || '').trim();
                    if (!MERMAID_KEYWORDS.test(code)) continue;
                    const id = 'mermaid-' + Math.random().toString(36).slice(2);
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'background:rgba(0,0,0,0.4);border:1px solid rgba(212,175,55,0.2);border-radius:6px;padding:12px;margin:8px 0;overflow-x:auto;';
                    const { svg } = await window.mermaid.render(id, code);
                    wrapper.innerHTML = svg;
                    el.replaceWith(wrapper);
                } catch(e) { }
            }
        }
    };

    UniversalExtractor.init();
    window.AureliaHtmlExtractor = UniversalExtractor;
    console.log('✅ 奧瑞亞檔案庫 V11.5 (PhoneOS UI 終極純淨版 + 全通用插件支援 + 終端輸入遷移) 已啟動');
})();