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
            this.initStoryFlow();
        },

        // ── 發消息 → 自動轉等待室 → 故事就緒自動讓路（2026-06-11）────────────
        // 藏書開在 VN 面板內：訊息完成時 vn_core 的自動偵測本來就會套劇本＋切到劇情頁，
        // 但藏書蓋在上面、生成期間也沒有任何狀態 → 這裡補一塊等待室 overlay：
        //   發消息（生成開始）→「故事撰寫中…」＋圖片進度（早鳥已在背景生）
        //   → 回覆落地且含 <content> →「進入劇情」並收起藏書讓路（劫持的輸入框同步還原）
        //   → 劇情頁的開場閘門接手：圖沒好會自己擋 loading
        _flowInited: false,
        _genWatch: null,
        initStoryFlow() {
            if (this._flowInited) return;
            const w = window;
            if (!w.eventOn || !w.tavern_events) { setTimeout(() => this.initStoryFlow(), 1000); return; }
            this._flowInited = true;
            const ev = w.tavern_events;

            if (ev.GENERATION_STARTED) w.eventOn(ev.GENERATION_STARTED, () => {
                if (!this.isVisible) return;   // 只在藏書開著時接管
                this._showFlowOverlay();
            });

            // 生成被手動停止 / 出錯沒有回覆 → 收起等待室別卡人
            if (ev.GENERATION_STOPPED) w.eventOn(ev.GENERATION_STOPPED, () => this._hideFlowOverlay());
            if (ev.GENERATION_ENDED) w.eventOn(ev.GENERATION_ENDED, () => {
                setTimeout(() => { if (this._overlayShown()) this._hideFlowOverlay(); }, 4000);
            });

            if (ev.MESSAGE_RECEIVED) w.eventOn(ev.MESSAGE_RECEIVED, (mid) => {
                if (!this._overlayShown()) return;
                let txt = '';
                try {
                    const ctx = w.SillyTavern?.getContext?.();
                    const m = ctx?.chat?.[mid];
                    txt = (m && !m.is_user) ? (m.mes || m.message || '') : '';
                } catch (e) {}
                if (!txt.includes('<content>')) { this._hideFlowOverlay(); return; }   // 不是劇情回覆 → 靜默收起
                const label = document.getElementById('se-flow-label');
                if (label) label.textContent = '✓ 故事就緒，進入劇情…';
                // 自動偵測那邊正在套劇本＋切頁；稍等再收起藏書讓路
                setTimeout(() => { this._hideFlowOverlay(); this.hide(); }, 800);
            });

            console.log('[StoryExtractor] ✅ 發消息→等待室→進劇情 流程已掛載');
        },

        _overlayShown() { return !!document.getElementById('se-flow-overlay'); },

        _showFlowOverlay() {
            if (this._overlayShown()) return;
            const host = document.getElementById('se-root-wrapper');
            if (!host) return;
            const o = document.createElement('div');
            o.id = 'se-flow-overlay';
            o.innerHTML = '<div id="se-flow-spin"></div><div id="se-flow-label">故事撰寫中…</div><div id="se-flow-sub"></div>';
            host.appendChild(o);
            const t0 = Date.now();
            this._genWatch = setInterval(() => {
                const label = document.getElementById('se-flow-label');
                const sub   = document.getElementById('se-flow-sub');
                if (!label) return;
                const sec = Math.round((Date.now() - t0) / 1000);
                if (!label.textContent.startsWith('✓')) label.textContent = `故事撰寫中… ${sec}s`;
                try {
                    const st = window.VN_Core?.imgPendingStatus?.();
                    if (sub && st && (st.pending > 0 || st.total > 0)) sub.textContent = `圖片繪製中 ${st.done}/${st.total}`;
                } catch (e) {}
            }, 1000);
        },

        _hideFlowOverlay() {
            if (this._genWatch) { clearInterval(this._genWatch); this._genWatch = null; }
            const o = document.getElementById('se-flow-overlay');
            if (o) o.remove();
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
                            window.StoryExtractor && window.StoryExtractor.hide();
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
            // reentry guard：hideVnPanel 內呼叫 StoryExtractor.hide()，而 hide() 內又會
            // 經 _maybeHideVnPanel → hideVnPanel 回呼 → 無限遞迴卡頓
            if (this._hiding) return;
            this._hiding = true;
            try { this._doHide(); } finally { this._hiding = false; }
        },

        _doHide() {
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
