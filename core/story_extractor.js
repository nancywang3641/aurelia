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

            if (ev.GENERATION_STARTED) w.eventOn(ev.GENERATION_STARTED, (type, opts, dryRun) => {
                if (dryRun) return;            // dryRun 試算空跑 → 別彈等待室
                if (!this.isVisible) return;   // 只在藏書開著時接管
                this._showFlowOverlay();
            });

            // 生成被手動停止 / 出錯沒有回覆 → 收起等待室別卡人
            if (ev.GENERATION_STOPPED) w.eventOn(ev.GENERATION_STOPPED, () => this._hideFlowOverlay());
            if (ev.GENERATION_ENDED) w.eventOn(ev.GENERATION_ENDED, () => {
                setTimeout(() => { if (this._overlayShown() && !this._waitClose) this._hideFlowOverlay(); }, 4000);
            });

            const _readReply = (mid) => {
                try {
                    const ctx = w.SillyTavern?.getContext?.();
                    const m = ctx?.chat?.[mid];
                    return (m && !m.is_user) ? (m.mes || m.message || '') : '';
                } catch (e) { return ''; }
            };

            if (ev.MESSAGE_RECEIVED) w.eventOn(ev.MESSAGE_RECEIVED, (mid) => {
                if (!this._overlayShown()) return;
                const txt = _readReply(mid);
                if (!txt.includes('<content>')) { this._hideFlowOverlay(); return; }   // 不是劇情回覆 → 靜默收起
                // 沒收尾＝AI 還在輸出（TauriTavern 事件來得早）→ 留在等待室輪詢等 </content>
                if (!txt.includes('</content>')) {
                    if (this._waitClose) return;
                    const t0 = Date.now();
                    this._waitClose = setInterval(() => {
                        const t2 = _readReply(mid);
                        if (t2.includes('</content>')) {
                            clearInterval(this._waitClose); this._waitClose = null;
                            this._enterStory();
                        } else if ((Date.now() - t0) > 300000) {
                            clearInterval(this._waitClose); this._waitClose = null;
                            this._hideFlowOverlay();
                        }
                    }, 1500);
                    return;
                }
                this._enterStory();
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

        _enterStory() {
            const label = document.getElementById('se-flow-label');
            if (label) label.textContent = '✓ 故事就緒，進入劇情…';
            // 自動偵測那邊正在套劇本＋切頁；稍等再收起藏書讓路
            setTimeout(() => { this._hideFlowOverlay(); this.hide(); }, 800);
        },

        _hideFlowOverlay() {
            if (this._genWatch) { clearInterval(this._genWatch); this._genWatch = null; }
            if (this._waitClose) { clearInterval(this._waitClose); this._waitClose = null; }
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
                <div id="se-toolbar">
                    <button class="se-back-btn" title="返回" id="se-btn-close">‹</button>
                    <div class="se-title">踏入故事</div>
                    <div class="se-controls">
                        <button class="se-icon-btn" title="切換主題" id="se-btn-theme">🌙</button>
                        <button class="se-icon-btn" title="刷新" id="se-btn-refresh">↻</button>
                    </div>
                </div>
                <div id="se-swipe-bar" class="se-hidden">
                    <button class="se-swipe-btn" id="se-swipe-first" type="button" title="回第一個開場"><i class="fa-solid fa-angles-left"></i></button>
                    <button class="se-swipe-btn" id="se-swipe-prev" type="button" title="上一個開場"><i class="fa-solid fa-chevron-left"></i></button>
                    <div id="se-swipe-label">開場 1 / 1</div>
                    <button class="se-swipe-btn" id="se-swipe-next" type="button" title="下一個開場"><i class="fa-solid fa-chevron-right"></i></button>
                </div>
                <div id="se-mode-bar" class="se-hidden">
                    <span id="se-mode-label">本卡模式</span>
                    <button class="se-mode-chip" id="se-mode-lib" type="button" title="有準備圖庫的卡：表情立繪照舊，AI 輸出表情格">圖庫（表情立繪）</button>
                    <button class="se-mode-chip" id="se-mode-free" type="button" title="世界卡/隨機NPC：立繪純生成，AI 不輸出表情格、省字">自由（純生成）</button>
                </div>
                <div id="se-content-area"></div>
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

            rootWrapper.querySelector('#se-btn-refresh').onclick = () => this.scanAndRender(true);   // 手動刷新＝強制重演（跳過原稿沒變的略過判定）

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
            this._startChatSync();   // 卡片自帶跳轉鈕改第 0 樓時，藏書自動跟上
            this._refreshModeBar(rootWrapper);   // 🎲 本卡模式（圖庫/自由）chips
        },

        // ── 🎲 本卡模式切換（按 storyId=這張卡記，同卡開新聊天不用重選）：
        //    圖庫＝現狀（表情立繪+生成fallback）；自由＝純生成、AI 不輸出表情格（VN_FREE_MODE 負責
        //    總綱條目二選一+歷史表情格剝除正則的自動開關）。拿不到 VN_FREE_MODE（PWA）就整條藏起。──
        _refreshModeBar(rootWrapper) {
            try {
                const bar = (rootWrapper || document).querySelector('#se-mode-bar');
                if (!bar) return;
                const FM = window.VN_FREE_MODE;
                if (!FM || !FM.storyId()) { bar.classList.add('se-hidden'); return; }
                const free = FM.isFree();
                const libBtn = bar.querySelector('#se-mode-lib'), freeBtn = bar.querySelector('#se-mode-free');
                libBtn.classList.toggle('active', !free);
                freeBtn.classList.toggle('active', free);
                libBtn.onclick = async () => { if (!FM.isFree()) return; await FM.set(false); this._refreshModeBar(rootWrapper); };
                freeBtn.onclick = async () => { if (FM.isFree()) return; await FM.set(true); this._refreshModeBar(rootWrapper); };
                bar.classList.remove('se-hidden');
            } catch (e) { console.warn('[StoryExtractor] 模式列失敗:', e); }
        },

        // 多來源重渲染請求（切換鈕 / 第0樓觀察者 / 卡片跳轉）合併成一拍，只渲一次——治連發全套重演的卡頓
        _renderTimer: null,
        _lastRenderSig: null,
        _scheduleRender(delay = 300) {
            clearTimeout(this._renderTimer);
            this._renderTimer = setTimeout(() => this.scanAndRender(), delay);
        },

        // 把開場白整段渲染進單一區域：純文字 + HTML 區塊依原本順序堆疊
        // 卡頓優化：①原稿沒變就跳過（防重複請求白演）②區塊先組進 fragment、最後一次上牆（不逐塊 reflow）
        scanAndRender(force = false) {
            const contentArea = document.getElementById('se-content-area');
            if (!contentArea) return;

            this._refreshSwipeBar();   // 開場白切換列（多開局卡）——async 自理、不擋渲染

            const firstMes = document.querySelector('#chat .mes[mesid="0"] .mes_text');

            if (!firstMes) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">📭</div>
                    找不到開場白<br><small>請先開啟一個角色卡對話</small>
                </div>`;
                this._lastRenderSig = null;
                return;
            }

            const sig = firstMes.innerHTML;
            if (!force && sig === this._lastRenderSig && contentArea.children.length) return;   // 原稿沒變 → 不重演
            this._lastRenderSig = sig;

            this._stopPanelMedia();   // 重渲染前先停舊媒體(detached <audio> 不會自己停)，換卡不疊加 BGM
            // 渲染後卡片自帶 BGM 會自動播 → 延遲幾拍靜掉(藏書是預覽、不該被卡片 BGM 洗版；含 iframe 晚載)
            setTimeout(() => this._stopPanelMedia(), 300);
            setTimeout(() => this._stopPanelMedia(), 1200);

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sig;

            const BLOCK_TAGS = ['DIV', 'TABLE', 'FORM', 'DETAILS', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'FIELDSET', 'FIGURE', 'IFRAME', 'CANVAS', 'SVG'];

            const frag = document.createDocumentFragment();   // 先在記憶體組好、最後一次上牆
            let textBuffer = [];
            const flushText = () => {
                if (textBuffer.length === 0) return;
                const html = textBuffer.join('');
                if (html.replace(/<[^>]*>/g, '').trim()) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'native-render-wrapper';
                    wrapper.innerHTML = html;
                    frag.appendChild(wrapper);
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
                        frag.appendChild(wrapper);
                    } else {
                        textBuffer.push(node.outerHTML);
                    }
                }
            });
            flushText();

            contentArea.innerHTML = '';
            contentArea.appendChild(frag);

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

        // ── 開場白切換列（卡片多開局）：拿「資料」自建、不搬酒館 DOM ──
        //    來源＝第 0 樓 swipes ∪ 卡片 first_mes/alternate_greetings（保留既有、只補缺、宏先替換）；
        //    切換走官方 setChatMessages swipe_id（真改第 0 樓＋自動重渲染＋存檔），切完重刮 mesid=0 照舊渲染。
        //    只在「第 0 樓就是最後一樓」(劇情還沒推進) 時開放；開打後藏起來、只看當前開場。
        async _refreshSwipeBar() {
            const bar = document.getElementById('se-swipe-bar');
            if (!bar) return;
            bar.classList.add('se-hidden');
            try {
                const TH = window.TavernHelper;
                if (!TH?.getChatMessages || !TH?.setChatMessages || !TH?.getLastMessageId) return;
                if (TH.getLastMessageId() !== 0) return;   // 劇情已推進 → 不給改開局
                const m0 = (TH.getChatMessages(0, { include_swipes: true }) || [])[0];
                if (!m0) return;
                let swipes = (Array.isArray(m0.swipes) && m0.swipes.length) ? m0.swipes.slice() : [String(m0.message || '')];

                // 卡片的備用開場白還沒進第 0 樓 → 併進 swipes（宏替換後比對，原文/替換後任一已存在就不重複補）
                try {
                    const cd = TH.getCharData ? TH.getCharData('current') : null;
                    const alts = [cd?.first_mes].concat(cd?.data?.alternate_greetings || cd?.alternate_greetings || []);
                    const sub = (t) => { try { const c = window.SillyTavern?.getContext?.(); return c?.substituteParams ? c.substituteParams(t) : t; } catch (e) { return t; } };
                    const have = new Set(swipes.map(s => String(s).trim()));
                    const missing = [];
                    for (const g of alts) {
                        if (!g || !String(g).trim()) continue;
                        const s = sub(String(g));
                        if (have.has(s.trim()) || have.has(String(g).trim())) continue;
                        missing.push(s); have.add(s.trim());
                    }
                    if (missing.length) {
                        swipes = swipes.concat(missing);
                        await TH.setChatMessages([{ message_id: 0, swipes }], { refresh: 'none' });
                        console.log(`[StoryExtractor] 已把卡片的 ${missing.length} 個備用開場白補進第 0 樓`);
                    }
                } catch (e) { console.warn('[StoryExtractor] 補開場白清單失敗:', e); }

                if (swipes.length <= 1) return;   // 單開場卡不顯示切換列
                const cur = m0.swipe_id || 0;
                bar.querySelector('#se-swipe-label').textContent = `開場 ${cur + 1} / ${swipes.length}`;
                const first = bar.querySelector('#se-swipe-first'), prev = bar.querySelector('#se-swipe-prev'), next = bar.querySelector('#se-swipe-next');
                first.disabled = cur <= 0;
                prev.disabled = cur <= 0;
                next.disabled = cur >= swipes.length - 1;
                first.onclick = () => this._switchGreeting(0);
                prev.onclick = () => this._switchGreeting(cur - 1);
                next.onclick = () => this._switchGreeting(cur + 1);
                bar.classList.remove('se-hidden');
            } catch (e) { console.warn('[StoryExtractor] 開場白切換列失敗:', e); }
        },

        async _switchGreeting(idx) {
            try {
                await window.TavernHelper.setChatMessages([{ message_id: 0, swipe_id: idx }]);   // 官方切換：改第 0 樓＋重渲染＋存檔
                this._scheduleRender(300);   // 跟同步觀察者共用同一個排程 → 一次切換只重演一遍
            } catch (e) { console.warn('[StoryExtractor] 切換開場失敗:', e); }
        },

        // ── 第 0 樓同步觀察者：卡片自帶的「跳轉開場」美化按鈕(QR/腳本)改的是酒館第 0 樓，
        //    藏書是拓印不會自己跟上 → 盯 #chat 裡 mesid=0 的 DOM 變動，防抖後自動重渲染。──
        _chatObserver: null,
        _startChatSync() {
            if (this._chatObserver) return;
            const chat = document.getElementById('chat');
            if (!chat) return;
            this._chatObserver = new MutationObserver((muts) => {
                if (!this.isVisible) return;
                const hit = muts.some(m => {
                    const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
                    return el && el.closest && el.closest('.mes[mesid="0"]');
                });
                if (!hit) return;
                console.log('[StoryExtractor] 偵測到第 0 樓變動 → 排程同步重渲染');
                this._scheduleRender(400);
            });
            this._chatObserver.observe(chat, { childList: true, subtree: true, characterData: true });
            console.log('[StoryExtractor] 第 0 樓同步觀察者已啟動');
        },
        _stopChatSync() {
            try { this._chatObserver?.disconnect(); } catch (e) {}
            this._chatObserver = null;
            clearTimeout(this._renderTimer);
        },

        // 文字 wrapper 偷學作者 HTML 面板的視覺：背景、遮罩、文字色、邊框、圓角、陰影、字體
        // bg 捐贈者：第一個有底色或 bg-image 的可見元素
        // overlay 捐贈者：全屏絕對定位 + 半透明底色（疊在 bg 上的「夜色」遮罩）
        // 文字色捐贈者：第一個有直接文字內容的可見元素
        mimicAuthorStyle(contentArea) {
            const blocks = contentArea.querySelectorAll('.story-html-block');
            if (!blocks.length) return;

            // 酒館主題的預設字色＝繼承來的、不是作者風格——找字色捐贈者時優先跳過它（Rae 抓到的白字真兇：
            // 偷到「沒被作者調過色」的元素，拿走的其實是酒館預設白字）
            let tavernDefaultColor = null;
            try { tavernDefaultColor = getComputedStyle(document.querySelector('#chat .mes_text') || document.body).color; } catch (e) {}

            let bgDonor = null;
            let overlayDonor = null;
            let textDonor = null;
            for (const block of blocks) {
                if (!bgDonor) bgDonor = this.findStyledDonor(block);
                if (!overlayDonor) overlayDonor = this.findOverlayDonor(block);
                if (!textDonor) textDonor = this.findTextDonor(block, tavernDefaultColor);
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

            // ── 對比度守衛：bg 和字色來自「不同捐贈者」、沒人保證是一對（白底白字/深底深字的真兇）。
            //    算「實際有效底色」（捐贈者底色透明就疊回藏書自身紙色、overlay 也疊進去）跟字色的對比，
            //    不及格 → 按底色亮暗強制改成看得見的字色；底是圖片看不出亮暗 → 改給字加反差描邊保底。──
            const _rgb = (s) => { const m = String(s || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
            const _luma = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
            const _blend = (top, base) => !top || top.a <= 0 ? base : { r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 };
            const _paper = this.currentTheme === THEMES.darkgold ? { r: 17, g: 26, b: 56, a: 1 } : { r: 246, g: 243, b: 234, a: 1 };
            let _effBg = _blend(_rgb(bgCs.backgroundColor), _paper);
            _effBg = _blend(_rgb(overlayColor), _effBg);
            let finalTextColor = textColor;
            let guardShadow = '';
            const _txt = _rgb(textColor);
            if (_txt) {
                const hasImg = bgCs.backgroundImage !== 'none';
                const lb = _luma(_effBg), lt = _luma(_txt);
                const ratio = (Math.max(lb, lt) + 0.05) / (Math.min(lb, lt) + 0.05);
                if (hasImg && !overlayColor) {
                    // 底是圖片、又沒遮罩壓底 → 亮暗未知，給字上反差描邊保底（不改作者的字色）
                    guardShadow = lt > 0.5 ? '0 0 4px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)' : '0 0 4px rgba(255,255,255,0.85), 0 1px 2px rgba(255,255,255,0.9)';
                } else if (ratio < 3) {
                    finalTextColor = lb > 0.5 ? '#2c261d' : '#f2ead8';
                    console.log(`[StoryExtractor] ⚠️ 偷到的字色跟底色對比不足(${ratio.toFixed(2)}) → 強制改 ${finalTextColor}`);
                }
            }

            contentArea.querySelectorAll('.native-render-wrapper').forEach(w => {
                w.style.backgroundColor = bgCs.backgroundColor;
                w.style.backgroundImage = composedBgImage;
                w.style.backgroundSize = bgCs.backgroundSize;
                w.style.backgroundPosition = bgCs.backgroundPosition;
                w.style.backgroundRepeat = bgCs.backgroundRepeat;
                w.style.color = finalTextColor;
                w.style.textShadow = guardShadow;
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
        findTextDonor(wrapper, defaultColor) {
            const hasText = (el) => {
                for (const child of el.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) return true;
                }
                return false;
            };
            // 兩段式：先找「作者真的調過字色」的元素（顏色≠酒館預設字色）；全都是預設色才退回第一個有字的
            if (defaultColor) {
                const styled = this._bfsFindFirst(wrapper, (el) => hasText(el) && getComputedStyle(el).color !== defaultColor, 7);
                if (styled) return styled;
            }
            return this._bfsFindFirst(wrapper, hasText, 7);
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
                            // 高度沒變就別寫——每寫一次就觸發下一輪 resize，ResizeObserver 自迴圈空轉的來源
                            const want = (realHeight + 100) + 'px';
                            if (realHeight > 0 && iframe.style.height !== want) iframe.style.height = want;
                            if (doc.body.style.overflow !== 'hidden') doc.body.style.overflow = 'hidden';
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

        // 停掉藏書面板裡「卡片自帶的 BGM/音訊」——角色卡開場白常含 <audio autoplay>，
        //   渲染進預覽就自動播；★移除播放中的 <audio> 不一定會停(detached 仍續播)，必須先 pause()。
        //   同源 iframe 內的也順手停。關閉/換卡/渲染後都呼叫 → 不殘留、不疊加、預覽不被洗版。
        _stopPanelMedia() {
            try {
                const docs = [document];
                try { const pd = window.parent && window.parent.document; if (pd && pd !== document) docs.push(pd); } catch (e) {}
                const stop = (m) => { try { m.pause(); m.currentTime = 0; m.muted = true; m.removeAttribute('autoplay'); } catch (e) {} };
                docs.forEach(d => {
                    ['se-content-area', 'story-extractor-container-vn', 'story-panel-container'].forEach(id => {
                        const root = d.getElementById && d.getElementById(id);
                        if (!root) return;
                        root.querySelectorAll('audio, video').forEach(stop);
                        root.querySelectorAll('iframe').forEach(f => {
                            try { const idoc = f.contentWindow && f.contentWindow.document; if (idoc) idoc.querySelectorAll('audio, video').forEach(stop); } catch (e) {}
                        });
                    });
                });
            } catch (e) { console.warn('[StoryExtractor] 停止面板媒體失敗', e); }
        },

        hide() {
            // reentry guard：hideVnPanel 內呼叫 StoryExtractor.hide()，而 hide() 內又會
            // 經 _maybeHideVnPanel → hideVnPanel 回呼 → 無限遞迴卡頓
            if (this._hiding) return;
            this._hiding = true;
            this._stopChatSync();   // 面板收起就別再盯第 0 樓
            try { this._doHide(); } finally { this._hiding = false; }
        },

        _doHide() {
            console.log('[StoryExtractor] 🔍 hide() 被調用');

            // 先停掉卡片自帶 BGM，再清空內容(移除 <audio>/iframe＝斷源停音)，避免關閉後 BGM 殘留/疊加
            this._stopPanelMedia();
            try {
                [document, (window.parent && window.parent.document)].forEach(d => {
                    try { const ca = d && d.getElementById && d.getElementById('se-content-area'); if (ca) ca.innerHTML = ''; } catch (e) {}
                });
            } catch (e) {}

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
