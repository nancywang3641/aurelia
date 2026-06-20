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

        // 最後一則訊息「原文」（讀資料、不碰 live DOM）→ 治 TauriTavern 懶渲染「沒滾到就抓不到」。
        //   最新一則永遠在載入窗內，不吃懶載入那套（見 vn_core 同款做法）。
        _getLastMessageRaw() {
            const win = window.parent || window;
            try {
                const ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
                if (ctx && Array.isArray(ctx.chat) && ctx.chat.length) {
                    const m = ctx.chat[ctx.chat.length - 1];
                    return (m && (m.mes || m.message)) || '';
                }
            } catch (e) {}
            try {
                const th = win.TavernHelper || window.TavernHelper;
                if (th && typeof th.getChatMessages === 'function') {
                    const r = th.getChatMessages(-1);
                    if (r && r[0]) return r[0].message || r[0].mes || '';
                }
            } catch (e) {}
            return '';
        },

        // 從最後一則訊息原文抽「卡片」，不靠 DOM。來源：① 訊息裡的 ```html 圍欄 ② 酒館顯示型正則(find→replace 產 HTML)。
        //   回 [{ name, html, isDoc }]；拿不到原文 → null（呼叫端退回舊 DOM 路徑）。同 VN 的 _grabRegexCardHtml 思路。
        _getMessagePanels() {
            const win = window.parent || window;
            const raw = this._getLastMessageRaw();
            if (!raw) return null;

            const units = [];
            const _seen = new Set();
            const _push = (h, nameHint) => {
                let card = String(h || '').replace(/^\s*```html\s*/i, '').replace(/```\s*$/i, '').trim();
                if (!card || !/<[a-z!\/]/i.test(card)) return;          // 取代結果不含 HTML 標籤 → 不是卡片
                const key = card.replace(/\s+/g, '');
                if (_seen.has(key)) return;                              // 兩來源可能撞同一張 → 去重
                _seen.add(key);
                const titleM = card.match(/<title>([\s\S]*?)<\/title>/i);
                const name = (titleM && titleM[1].trim()) || nameHint || '面板';
                const isDoc = /<!DOCTYPE|<html[\s>]|<body[\s>]/i.test(card);
                units.push({ name, html: card, isDoc });
            };

            // ① ```html 圍欄區塊（你的狀態卡多半直接寫在訊息裡這種）
            try {
                const fence = /```(?:html)?[ \t]*\n?([\s\S]*?)```/gi;
                let fm, guard = 0;
                while ((fm = fence.exec(raw)) !== null && guard++ < 60) {
                    const code = (fm[1] || '').trim();
                    if (/<[a-z!\/]/i.test(code)) _push(code);
                }
            } catch (e) {}

            // ② 酒館顯示型正則：trigger tag → HTML 卡片（朋友用正則型卡也吃得到）
            try {
                const th = win.TavernHelper || window.TavernHelper;
                if (th && typeof th.getTavernRegexes === 'function') {
                    const parseRegex = (str) => {
                        if (!str) return null;
                        try { const m = String(str).match(/^\/([\s\S]*)\/([a-z]*)$/i); return m ? new RegExp(m[1], m[2] || '') : new RegExp(str, 'i'); }
                        catch (e) { return null; }
                    };
                    let regexes = [];
                    try { regexes = regexes.concat(th.getTavernRegexes({ type: 'global' }) || []); } catch (e) {}
                    try { regexes = regexes.concat(th.getTavernRegexes({ type: 'character', name: 'current' }) || []); } catch (e) {}
                    try { regexes = regexes.concat(th.getTavernRegexes({ type: 'preset', name: 'in_use' }) || []); } catch (e) {}
                    for (const r of regexes) {
                        if (!r || r.enabled === false || !r.find_regex) continue;
                        if (r.destination && r.destination.display === false) continue;   // 只認「顯示型」(promptOnly 不算)
                        const rs = r.replace_string || '';
                        if (!/<[a-z!\/]/i.test(rs)) continue;                              // 取代結果不含標籤 → 純文字替換，跳過
                        const base = parseRegex(r.find_regex);
                        if (!base) continue;
                        const g = new RegExp(base.source, base.flags.includes('g') ? base.flags : base.flags + 'g');
                        let m, guard = 0;
                        while ((m = g.exec(raw)) !== null && guard++ < 60) {
                            _push(m[0].replace(base, rs), r.script_name || r.scriptName);
                            if (m.index === g.lastIndex) g.lastIndex++;                    // 防零寬無限迴圈
                        }
                    }
                }
            } catch (e) {}

            return units;
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

            const ALLOWED_TAGS = ['DIV', 'TABLE', 'IFRAME', 'SCRIPT', 'STYLE', 'CANVAS', 'SVG', 'SECTION', 'ASIDE', 'NAV', 'HEADER', 'FOOTER', 'UL', 'OL', 'DL', 'FORM', 'DETAILS'];

            // 🔥 主路徑：抓正則（讀「最後一則訊息原文」+ ```html 圍欄 / 酒館顯示型正則自渲染）→ 不靠 live DOM，
            //    根治 TauriTavern 懶渲染「沒滾到正確區域就抓不到」。完整 HTML 文件包 iframe、片段直接塞。
            const msgPanels = this._getMessagePanels();
            const haveMsg = !!(msgPanels && msgPanels.length);
            if (haveMsg) {
                msgPanels.forEach((c, i) => {
                    const id = 'msg_panel_' + i;
                    const inner = c.isDoc
                        ? `<iframe class="native-render-frame" scrolling="no" srcdoc="${c.html.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`
                        : `<div class="native-render-wrapper">${c.html}</div>`;
                    extractedData[id] = { name: c.name, html: [inner] };
                    tabOrder.push(id);
                });
            }

            // 「其他擴展與物件」：別的擴展「直接注入 DOM」的東西（本質只能靠 DOM）→ 有渲染才撈、沒渲染就略過。
            //   正則路徑有抓到時：把 .TH-render 拿掉（卡片已由正則覆蓋）只補「其他」；沒抓到時：保留舊 DOM 全行為當 fallback。
            const lastMes = doc.querySelector('#chat .mes.last_mes .mes_text');
            if (lastMes) {
                const tempMesDiv = doc.createElement('div');
                tempMesDiv.innerHTML = lastMes.innerHTML;

                const pTags = Array.from(tempMesDiv.querySelectorAll('p'));
                pTags.forEach(p => {
                    Array.from(p.children).forEach(child => {
                        if (ALLOWED_TAGS.includes(child.tagName.toUpperCase())) {
                            p.parentNode.insertBefore(child, p);
                        }
                    });
                    if (p.textContent.trim() === '' && p.children.length === 0) p.remove();
                });

                if (haveMsg) {
                    // 卡片已由正則路徑提供 → 移除 TH-render，避免同一張卡重複出現
                    tempMesDiv.querySelectorAll('.TH-render').forEach(n => n.remove());
                } else {
                    // fallback：正則沒結果（TavernHelper 未就緒等）→ 維持舊行為，把 .TH-render 當面板抽出
                    const thRenders = Array.from(tempMesDiv.querySelectorAll('.TH-render'));
                    thRenders.forEach((thNode, index) => {
                        let panelName = '自定義面板';
                        const codeBlock = thNode.querySelector('code.custom-language-html');
                        if (codeBlock) {
                            const rawHtml = codeBlock.innerText || codeBlock.textContent;
                            const titleMatch = rawHtml.match(/<title>(.*?)<\/title>/i);
                            if (titleMatch && titleMatch[1]) panelName = titleMatch[1].trim();
                        }
                        const panelId = 'th_panel_' + index;
                        if (!extractedData[panelId]) { extractedData[panelId] = { name: panelName, html: [] }; tabOrder.push(panelId); }
                        extractedData[panelId].html.push(`<div class="native-render-wrapper">${thNode.outerHTML}</div>`);
                        thNode.remove();
                    });
                }

                const othersHtml = [];
                Array.from(tempMesDiv.children).forEach(el => {
                    if (ALLOWED_TAGS.includes(el.tagName.toUpperCase())) {
                        othersHtml.push(`<div class="native-render-wrapper">${el.outerHTML}</div>`);
                    }
                });
                if (othersHtml.length > 0) {
                    extractedData['others'] = { name: '其他擴展與物件', html: othersHtml };
                    tabOrder.push('others');
                }
            }

            if (tabOrder.length === 0) {
                contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#999; margin-top:50px;">
                    <div style="font-size:40px; margin-bottom:10px;">🔍</div>
                    未提取到面板（訊息無狀態卡，或 TavernHelper 未就緒）。
                </div>`;
                // 狀態面板(煉丹)讀 OS_DB、不靠 DOM/正則 → 仍嘗試注入
                this._injectStatePanelTab().catch(e => console.warn('[Extractor] 狀態面板注入失敗:', e));
                return;
            }

            tabOrder.forEach(id => {
                this.createTab(id, extractedData[id].name, extractedData[id].html.join(''));
            });

            if (!this.activeTab || !tabOrder.includes(this.activeTab)) {
                this.activeTab = tabOrder[0];
            }
            this.switchTab(this.activeTab);

            // 異步注入「狀態面板」固定 tab（從展廳啟用的 UI 模板渲染 + 當前變數值）
            // chatId-aware：不同 chat 對應不同 pack 的 active 模板
            this._injectStatePanelTab().catch(e => console.warn('[Extractor] 狀態面板注入失敗:', e));
        },

        async _injectStatePanelTab() {
            const win = window.parent || window;
            if (!win.OS_DB?.getAllUITemplates || !win.OS_AVS_ADAPTER) return;

            const chatId = win.OS_AVS_ADAPTER.getCurrentChatId?.() || '';
            if (!chatId) return;

            // 找當前 chat 對應的 pack（!pack.chatId 視為通用 fallback）
            const allPacks = await win.OS_DB.getAllVarPacks();
            const myPacks = (allPacks || []).filter(p => !p.chatId || p.chatId === chatId);
            if (!myPacks.length) return;
            const myPackIds = myPacks.map(p => p.id);

            // 找啟用中的 UI 模板（綁定我這些 pack 的）
            const templates = await win.OS_DB.getAllUITemplates();
            const activeTpl = (templates || []).find(t => t.isActive && myPackIds.includes(t.packId));
            if (!activeTpl) return;   // 沒煉丹過 / 沒啟用任何模板 → 不注入

            // 找此模板綁定的 pack（給第二層 fallback 用）
            const tplPack = myPacks.find(p => p.id === activeTpl.packId);

            // 用展廳/資訊中心那支「共用渲染引擎」(os_avs.renderTemplate) → 三處完全一致
            // （剝掉自包裝範本=不會有鬼角色、攤平舊「形象」巢狀、逐實體補初值），不再各寫一份分岔
            const state = win._AVS_ENGINE?.read?.() || {};
            const fmt = win.OS_AVS_ADAPTER?.formatVarValue || (v => String(v ?? ''));
            const _packVars = (tplPack && Array.isArray(tplPack.variables)) ? tplPack.variables : [];
            let _avatarMap = {};
            try { _avatarMap = (await win.OS_AVS?.buildAvatarMap?.(state, _packVars)) || {}; } catch (e) {}
            let html = '';
            try { html = (win.OS_AVS?.renderTemplate?.(activeTpl.htmlContent || '', state, _packVars, fmt, _avatarMap)) || (activeTpl.htmlContent || ''); }
            catch (e) { html = activeTpl.htmlContent || ''; console.warn('[Extractor] renderTemplate 失敗:', e); }
            if (activeTpl.cssContent) {
                html = `<style>${activeTpl.cssContent}</style>${html}`;
            }
            // 🔬 本輪更新了什麼：只顯示這輪副模型「改動的欄位」(delta)，不是整碗當前狀態。摺疊、預設收起。
            const _stEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const _le = win.OS_STATE_RUNTIME?.getLastExtract?.();
            const _upd = (_le && _le.updates) ? _le.updates : null;
            let _updBody;
            if (_upd && Object.keys(_upd).length) {
                _updBody = Object.entries(_upd).map(([k, v]) => {
                    const kk = String(k).replace(/^[^.]+\./, '');   // 去掉容器前綴(角色狀態.)，只留 角色.屬性
                    const vv = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
                    return _stEsc(kk + ' → ' + vv);
                }).join('\n');
            } else {
                _updBody = _le ? '本輪沒有更新任何欄位' : '本輪沒有抽取記錄（可能用 <vars> 或尚未生成）';
            }
            html = html + '<details style="margin-top:12px;"><summary style="cursor:pointer;font-size:12px;color:#a99;padding:8px 0;">🔬 本輪更新了什麼（點開看）</summary><pre style="white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.18);border-radius:8px;padding:10px;font-size:11px;line-height:1.7;color:#ccc;margin:6px 0 0;max-height:280px;overflow:auto;">' + _updBody + '</pre></details>';

            // 建 tab（重複建立會留下舊的，先清掉）
            const doc = win.document || document;
            const overlay = doc.getElementById('aurelia-extractor-phone-overlay');
            if (!overlay) return;
            const oldBtn  = overlay.querySelector('#tab-btn-aurelia_state_panel');
            const oldPane = overlay.querySelector('#tab-pane-aurelia_state_panel');
            if (oldBtn)  oldBtn.remove();
            if (oldPane) oldPane.remove();

            this.createTab('aurelia_state_panel', '🎲 狀態面板', html);

            // 把這個 tab 推到第一個位置（不在預設 tabOrder 內，加完是最後一個）
            const tabBar = overlay.querySelector('#ue-tab-bar');
            const newBtn = overlay.querySelector('#tab-btn-aurelia_state_panel');
            if (tabBar && newBtn && tabBar.firstChild !== newBtn) {
                tabBar.insertBefore(newBtn, tabBar.firstChild);
            }
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