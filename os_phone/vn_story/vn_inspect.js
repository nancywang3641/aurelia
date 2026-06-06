// ----------------------------------------------------------------
// [檔案] vn_inspect.js
// 路徑：os_phone/vn_story/vn_inspect.js
// 職責：VN 視覺小說播放器 - 獨立模式存檔/角色/錢包查閱面板 (VN_StandaloneArchive)
//       含 AVS 狀態檢視、回朔上一章、錢包/交易紀錄、選項選擇器、變數歷史 diff
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：(運行期) VN_Core, OS_DB, OS_ECONOMY, OS_API, _AVS_ENGINE
// 暴露：window.VN_StandaloneArchive
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 存檔查閱模組 (vn_inspect.js)...');
    const win = window.parent || window;

    const VN_StandaloneArchive = {
        _pendingChoices: null,  // [Choice|] 帶入的選項陣列
        _choiceCallback: null,  // 選項選定後的回調
        show() {
            const parentEl = document.getElementById('page-game') || document.body;
            let overlay = document.getElementById('aurelia-extractor-phone-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'aurelia-extractor-phone-overlay';
                parentEl.appendChild(overlay);
            }
            const gameBg = document.getElementById('game-bg');
            if (gameBg) overlay.style.backgroundImage = gameBg.style.backgroundImage;

            overlay.innerHTML = `
                <div id="ue-root-wrapper">
                    <div id="ue-toolbar">
                        <div style="display:flex;align-items:center;gap:5px;">
                            <button class="ue-icon-btn" id="ue-btn-close" style="font-size:28px;line-height:1;margin-left:-8px;">‹</button>
                            <div class="ue-title">Aurealis Core</div>
                        </div>
                        <div class="ue-controls">
                            <button class="ue-icon-btn" id="ue-btn-refresh" title="重新讀取">↻</button>
                        </div>
                    </div>
                    <div id="ue-tab-bar"></div>
                    <div id="ue-content-area"></div>
                </div>`;

            overlay.querySelector('#ue-btn-close').onclick = () => this.hide();
            overlay.querySelector('#ue-btn-refresh').onclick = () => this._renderContent(overlay);
            void overlay.offsetWidth;
            overlay.classList.add('show');
            this._renderContent(overlay);
        },

        hide() {
            if (this._avsListener) {
                win.removeEventListener('AVS_VARS_UPDATED', this._avsListener);
                this._avsListener = null;
            }
            this._rerollHandler = null;
            const overlay = document.getElementById('aurelia-extractor-phone-overlay');
            if (overlay) { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 360); }
        },

        async _renderContent(overlay) {
            const tabBar = overlay.querySelector('#ue-tab-bar');
            const contentArea = overlay.querySelector('#ue-content-area');
            tabBar.innerHTML = '';
            contentArea.innerHTML = '';
            // 若有待處理選擇，優先顯示選擇頁
            const hasChoices = this._pendingChoices && this._pendingChoices.length > 0;
            if (hasChoices) {
                this._addTab(tabBar, contentArea, 'choices', '🎯 做出選擇', this._choicesHtml(), true);
            }
            this._addTab(tabBar, contentArea, 'avs',      '📊 狀態',      await this._avsHtml(),       !hasChoices);
            this._addTab(tabBar, contentArea, 'wallet',   '💰 錢包',      this._walletHtml(),          false);

            // AVS_VARS_UPDATED 事件 → 自動刷新狀態 tab
            const _avsRefresh = async () => {
                const pane = overlay.querySelector('#tab-pane-avs');
                if (pane) pane.innerHTML = await this._avsHtml();
            };
            win.removeEventListener('AVS_VARS_UPDATED', this._avsListener);
            this._avsListener = _avsRefresh;
            win.addEventListener('AVS_VARS_UPDATED', this._avsListener);

            // 回朔按鈕（事件委派，動態插入後仍可觸發）
            if (this._rerollHandler) overlay.removeEventListener('click', this._rerollHandler);
            this._rerollHandler = async (e) => {
                if (e.target && e.target.id === 'avs-reroll-btn' && !e.target.disabled) {
                    e.target.disabled = true;
                    e.target.textContent = '回朔中...';
                    await this._avsReroll();
                    const pane = overlay.querySelector('#tab-pane-avs');
                    if (pane) pane.innerHTML = await this._avsHtml();
                } else if (e.target && e.target.id === 'avs-copy-extract-btn') {
                    // 匯出全部診斷數據(引擎當前狀態 + 本輪抽取 + 持久化 patches/base) → 貼給工程師查覆蓋根因
                    try {
                        const dump = {
                            engineState: win._AVS_ENGINE?.read?.() || null,
                            lastExtract: win.OS_STATE_RUNTIME?.getLastExtract?.() || null,
                            persisted: (win.OS_STATE_RUNTIME?.getStateDataDump) ? await win.OS_STATE_RUNTIME.getStateDataDump() : null
                        };
                        await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
                        e.target.textContent = '✅ 已複製';
                    } catch (err) {
                        e.target.textContent = '❌ 複製失敗（手動選取下方文字）';
                    }
                    setTimeout(() => { e.target.textContent = '📋 複製全部診斷數據（貼給工程師看）'; }, 1800);
                }
            };
            overlay.addEventListener('click', this._rerollHandler);
        },

        _addTab(tabBar, contentArea, id, name, html, active) {
            const btn = document.createElement('div');
            btn.className = 'ue-tab-item' + (active ? ' active' : '');
            btn.textContent = name;
            btn.onclick = () => {
                tabBar.querySelectorAll('.ue-tab-item').forEach(b => b.classList.remove('active'));
                contentArea.querySelectorAll('.ue-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                contentArea.querySelector(`#tab-pane-${id}`)?.classList.add('active');
            };
            tabBar.appendChild(btn);
            const pane = document.createElement('div');
            pane.className = 'ue-tab-pane' + (active ? ' active' : '');
            pane.id = `tab-pane-${id}`;
            pane.innerHTML = html;
            contentArea.appendChild(pane);
        },

        _choicesHtml() {
            const options = this._pendingChoices || [];
            const cb = this._choiceCallback;
            const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            const btns = options.map((opt, i) =>
                `<button id="ue-choice-btn-${i}" style="display:block;width:100%;text-align:left;
                    background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.22);
                    color:#c8b87a;padding:11px 15px;margin-bottom:8px;border-radius:4px;
                    font-size:0.87rem;cursor:pointer;line-height:1.5;transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(212,175,55,0.13)'"
                    onmouseout="this.style.background='rgba(212,175,55,0.06)'"
                >${esc(opt.replace(/「|」/g,''))}</button>`
            ).join('');

            // 選項點擊 → 貼入輸入框；發送按鈕 → 觸發 callback + loading
            setTimeout(() => {
                const inp = document.getElementById('ue-choice-input');
                const sendBtn = document.getElementById('ue-choice-send');

                options.forEach((opt, i) => {
                    const b = document.getElementById(`ue-choice-btn-${i}`);
                    if (!b) return;
                    b.onclick = () => {
                        if (inp) { inp.value = opt; inp.focus(); }
                        // 高亮選中
                        options.forEach((_, j) => {
                            const bj = document.getElementById(`ue-choice-btn-${j}`);
                            if (bj) { bj.style.borderColor = 'rgba(212,175,55,0.22)'; bj.style.background = 'rgba(212,175,55,0.06)'; }
                        });
                        b.style.borderColor = 'rgba(212,175,55,0.7)';
                        b.style.background  = 'rgba(212,175,55,0.16)';
                    };
                });

                const doSend = () => {
                    const val = inp?.value?.trim();
                    if (!val) return;
                    this._pendingChoices = null;

                    const vc = window.VN_Core;
                    if (vc) {
                        const gamePage = document.getElementById('page-game');
                        // 若 loader DOM 不存在，呼叫一次建立它
                        // （_showStartLoader(0) 會排 setTimeout(0) 隱藏，
                        //   但我們後面用 rAF 在它之後再 re-show）
                        if (!document.getElementById('vn-start-loader') && gamePage) {
                            vc._showStartLoader(0);
                        }
                        // requestAnimationFrame 在瀏覽器的事件迴圈中
                        // 排在 setTimeout(0) 之後才執行 → 可安全覆蓋那個 hide
                        requestAnimationFrame(() => {
                            const loaderEl  = document.getElementById('vn-start-loader');
                            const loaderBar = document.getElementById('vn-start-loader-bar');
                            const loaderLbl = document.getElementById('vn-start-loader-label');
                            if (!loaderEl) return;
                            loaderEl.style.display = 'flex';
                            if (loaderBar) {
                                loaderBar.style.transition = 'none';
                                loaderBar.style.width = '0%';
                                void loaderBar.offsetWidth;           // 強制 reflow
                                loaderBar.style.transition = 'width 30s cubic-bezier(0.1,0.5,0.5,1)';
                                loaderBar.style.width = '90%';
                            }
                            if (loaderLbl) loaderLbl.textContent = 'AI 生成中...';
                        });
                    }

                    this.hide();    // Archive 滑走（0.4s 動畫）
                    cb && cb(val);  // 觸發 AI 生成
                };

                if (sendBtn) sendBtn.onclick = doSend;
                if (inp) inp.onkeydown = e => { if (e.key === 'Enter') doSend(); };
            }, 50);

            return `
                <div style="display:flex;flex-direction:column;justify-content:center;
                            height:100%;padding:20px 12px;box-sizing:border-box;gap:0;">
                    <div>${btns}</div>
                    <div style="display:flex;gap:8px;align-items:center;
                                margin-top:14px;padding-top:12px;
                                border-top:1px solid rgba(212,175,55,0.12);">
                        <input id="ue-choice-input" type="text"
                            placeholder="點選項填入，或直接輸入..." maxlength="300"
                            style="flex:1;background:rgba(0,0,0,0.35);
                                   border:1px solid rgba(212,175,55,0.3);border-radius:4px;
                                   color:#e0d4a8;padding:10px 12px;font-size:0.84rem;
                                   outline:none;font-family:inherit;">
                        <button id="ue-choice-send"
                            style="background:rgba(212,175,55,0.18);
                                   border:1px solid rgba(212,175,55,0.5);
                                   color:#d4af37;padding:10px 20px;border-radius:4px;
                                   cursor:pointer;font-size:0.84rem;white-space:nowrap;
                                   transition:background 0.2s;font-family:inherit;"
                            onmouseover="this.style.background='rgba(212,175,55,0.32)'"
                            onmouseout="this.style.background='rgba(212,175,55,0.18)'">發送 ▶</button>
                    </div>
                </div>`;
        },

        async _avsHtml() {
            const storyId = window.VN_Core?._currentStoryId || '';
            const stateKey = storyId ? `avs_state_${storyId}` : 'avs_current_state';
            let state = {};
            try { state = JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch(e) {}
            const entries = Object.entries(state);

            // 讀取此故事所有章節（按時間升序）
            let storyChs = [];
            try {
                const allChs = await win.OS_DB?.getAllVnChapters?.() || [];
                storyChs = allChs.filter(c => c.storyId === storyId).sort((a, b) => (a.createdAt||0) - (b.createdAt||0));
            } catch(e) {}

            const lastChapter = storyChs.length ? storyChs[storyChs.length - 1] : null;
            const hasReroll = lastChapter && lastChapter.avsStateBefore !== undefined;
            const rerollBtn = `<button id="avs-reroll-btn" style="
                width:100%;padding:8px 0;margin-bottom:12px;border-radius:6px;
                background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);
                color:${hasReroll ? '#d4af37' : '#555'};font-size:12px;cursor:${hasReroll ? 'pointer' : 'not-allowed'};
                letter-spacing:1px;
            " ${hasReroll ? '' : 'disabled'}>↩ 回朔上一章節${hasReroll ? '' : '（無紀錄）'}</button>`;

            // 當前狀態面板（煉丹爐模板 or 原始變數）
            let activeTpls = [];
            try { activeTpls = JSON.parse(localStorage.getItem('avs_active_ui_templates') || '[]'); } catch(e) {}

            let panelHtml = '';
            if (activeTpls.length > 0) {
                let rendered = '';
                const _getByPath = (obj, path) => {
                    let cur = obj;
                    for (const k of String(path).split('.')) {
                        if (cur == null || typeof cur !== 'object') return undefined;
                        cur = cur[k];
                    }
                    return cur;
                };
                // 載入變數包：給 object 型變數補初值（pack 初值當底，state 即時值深合併蓋上去）
                let _allPacks = [];
                try { _allPacks = await win.OS_DB?.getAllVarPacks?.() || []; } catch(e) {}
                const _deepMerge = (base, over) => {
                    if (over == null) return base;
                    if (typeof base !== 'object' || typeof over !== 'object' || Array.isArray(base) || Array.isArray(over)) return over;
                    const out = { ...base };
                    for (const k of Object.keys(over)) out[k] = _deepMerge(base[k], over[k]);
                    return out;
                };
                for (const tpl of activeTpls) {
                    let html = tpl.htmlContent || '';
                    let css  = tpl.cssContent  || '';
                    // object 型變數：pack 初值當底，state 即時值深合併（副模型只抽到部分時其餘仍顯示初值）
                    let tplState = state;
                    const tplPack = _allPacks.find(p => p.id === tpl.packId);
                    if (tplPack && Array.isArray(tplPack.variables)) {
                        tplState = { ...state };
                        for (const v of tplPack.variables) {
                            if (v.type !== 'object') continue;
                            let initStruct = {};
                            try { initStruct = win._AVS_ENGINE?.parseTree?.(v.defaultValue) || {}; } catch(e) {}
                            tplState[v.name] = _deepMerge(initStruct, tplState[v.name]);
                        }
                    }
                    // {{#each 容器}}...{{/each}} 迴圈塊（object 型變數，對每個實體重複渲染卡片）
                    html = html.replace(/\{\{#each\s+([^\s{}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (m, cp, inner) => {
                        const container = _getByPath(tplState, cp);
                        if (!container || typeof container !== 'object') return '';
                        let blocks = '';
                        for (const [ek, ev] of Object.entries(container)) {
                            let block = inner.split('{{@key}}').join(ek);
                            if (ev && typeof ev === 'object') {
                                for (const [ak, av] of Object.entries(ev)) {
                                    block = block.split(`{{${ak}}}`).join(typeof av === 'object' ? JSON.stringify(av) : String(av));
                                }
                            }
                            block = block.replace(/\{\{[^{}]+\}\}/g, '—');
                            blocks += block;
                        }
                        return blocks;
                    });
                    // 扁平變數替換（object 型已由 each 處理，跳過）
                    Object.entries(tplState).forEach(([k, v]) => {
                        if (v && typeof v === 'object') return;
                        const re = new RegExp(`\\{\\{${k}\\}\\}`, 'g');
                        html = html.replace(re, String(v));
                    });
                    html = html.replace(/\{\{[^{}]+\}\}/g, '—');
                    rendered += `<style>${css}</style>${html}`;
                }
                panelHtml = `<div class="native-render-wrapper">${rendered}</div>`;
            } else if (entries.length === 0) {
                panelHtml = `<div style="padding:24px 0;text-align:center;color:#666;font-size:12px;">
                    目前沒有追蹤中的變數<br>
                    <span style="font-size:11px;color:#444;">AI 輸出 &lt;vars&gt; 後會自動出現<br>可在 變數工坊 AVS 用煉丹爐生成美化面板</span>
                </div>`;
            } else {
                const rows = entries.map(([k, v]) => {
                    const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(212,175,55,0.1);">
                        <span style="color:rgba(200,178,130,0.6);font-size:11px;font-family:monospace;">${k}</span>
                        <span style="color:#d4af37;font-size:13px;font-weight:bold;font-family:monospace;">${display}</span>
                    </div>`;
                }).join('');
                panelHtml = `<div>
                    <div style="font-size:10px;color:#555;letter-spacing:2px;margin-bottom:12px;">RAW STATE</div>
                    ${rows}
                </div>`;
            }

            // 變數歷史：計算每章 diff
            let historyHtml = '';
            if (storyChs.length > 0) {
                const chDiffs = storyChs.map((ch, i) => {
                    const before = ch.avsStateBefore || {};
                    // after = 下一章的 before，最後一章用當前 state
                    const after = (i < storyChs.length - 1)
                        ? (storyChs[i + 1].avsStateBefore || {})
                        : state;
                    // 收集所有 key
                    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
                    const changes = [];
                    keys.forEach(k => {
                        const bv = before[k];
                        const av = after[k];
                        if (JSON.stringify(bv) !== JSON.stringify(av)) {
                            changes.push({ k, bv, av });
                        }
                    });
                    return { ch, changes };
                }).filter(d => d.changes.length > 0).reverse(); // 最新在上

                if (chDiffs.length > 0) {
                    const diffRows = chDiffs.map(({ ch, changes }) => {
                        const changeLines = changes.map(({ k, bv, av }) => {
                            const bStr = bv === undefined ? '—' : (typeof bv === 'object' ? JSON.stringify(bv) : String(bv));
                            const aStr = av === undefined ? '—' : (typeof av === 'object' ? JSON.stringify(av) : String(av));
                            const numB = parseFloat(bv), numA = parseFloat(av);
                            let delta = '';
                            if (!isNaN(numB) && !isNaN(numA)) {
                                const d = numA - numB;
                                delta = `<span style="color:${d >= 0 ? '#2ecc71' : '#e74c3c'};font-size:10px;margin-left:4px;">${d >= 0 ? '+' : ''}${d}</span>`;
                            }
                            return `<div style="display:flex;gap:6px;align-items:center;padding:3px 0;">
                                <span style="color:#888;font-size:10px;font-family:monospace;min-width:60px;">${k}</span>
                                <span style="color:#666;font-size:10px;font-family:monospace;">${bStr}</span>
                                <span style="color:#555;font-size:10px;">→</span>
                                <span style="color:#d4af37;font-size:10px;font-family:monospace;">${aStr}</span>
                                ${delta}
                            </div>`;
                        }).join('');
                        const chTitle = ch.title || '未命名章節';
                        return `<div style="padding:10px 0;border-bottom:1px solid rgba(212,175,55,0.08);">
                            <div style="font-size:11px;color:#888;margin-bottom:6px;">📖 ${chTitle}</div>
                            ${changeLines}
                        </div>`;
                    }).join('');

                    historyHtml = `<details style="margin-top:16px;">
                        <summary style="cursor:pointer;font-size:11px;color:#888;letter-spacing:2px;list-style:none;display:flex;align-items:center;gap:6px;padding:8px 0;border-top:1px solid rgba(212,175,55,0.15);">
                            <span>▼</span><span>變數歷史 (${chDiffs.length} 章有變化)</span>
                        </summary>
                        <div style="padding-top:4px;">${diffRows}</div>
                    </details>`;
                }
            }

            // 🔬 診斷區（永遠顯示）：當前完整狀態 + 本輪副模型抽取；複製鈕匯出全部給工程師查覆蓋根因
            let lastExtractHtml = '';
            try {
                const _esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const engState = win._AVS_ENGINE?.read?.() || {};
                const le = win.OS_STATE_RUNTIME?.getLastExtract?.() || null;
                const updStr = (le && le.updates) ? JSON.stringify(le.updates, null, 2)
                    : (le ? '（這輪副模型沒回狀態更新）' : '（本輪尚無副模型抽取資料——若你是用 <vars> 主模型寫狀態，這格會空；或重載後先生成一輪再看）');
                const rawStr = (le && le.raw) ? le.raw : '（無——代表這次狀態不是副模型抽取寫的）';
                const memN = (le && le.memories) ? `・記憶 ${le.memories.length} 條` : '';
                lastExtractHtml = `<details style="margin-top:16px;" open>
                    <summary style="cursor:pointer;font-size:11px;color:#888;letter-spacing:2px;list-style:none;display:flex;align-items:center;gap:6px;padding:8px 0;border-top:1px solid rgba(212,175,55,0.15);">
                        <span>▼</span><span>🔬 診斷：當前狀態 + 本次更新${le ? `（msg#${le.msgId ?? '—'}${memN}）` : ''}</span>
                    </summary>
                    <div style="padding-top:6px;">
                        <button id="avs-copy-extract-btn" style="width:100%;padding:7px 0;margin-bottom:8px;border-radius:6px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);color:#d4af37;font-size:12px;cursor:pointer;">📋 複製全部診斷數據（貼給工程師看）</button>
                        <div style="font-size:10px;color:#666;margin:6px 0 2px;">① 當前完整狀態（引擎裡實際有的——看舊角色在不在）：</div>
                        <pre style="white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,0.3);border-radius:6px;padding:8px;font-size:10px;color:#cbb;max-height:220px;overflow:auto;margin:0;">${_esc(JSON.stringify(engState, null, 2))}</pre>
                        <div style="font-size:10px;color:#666;margin:8px 0 2px;">② 本輪副模型 updates：</div>
                        <pre style="white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,0.3);border-radius:6px;padding:8px;font-size:10px;color:#cbb;max-height:160px;overflow:auto;margin:0;">${_esc(updStr)}</pre>
                        <div style="font-size:10px;color:#666;margin:8px 0 2px;">③ 副模型原始輸出（看格式/結合記憶有沒有亂）：</div>
                        <pre style="white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,0.3);border-radius:6px;padding:8px;font-size:10px;color:#9a9;max-height:200px;overflow:auto;margin:0;">${_esc(rawStr)}</pre>
                    </div>
                </details>`;
            } catch(e) {}

            return `<div id="avs-tab-root" data-story="${storyId}" data-last-ch="${lastChapter?.id || ''}">
                ${rerollBtn}
                ${panelHtml}
                ${lastExtractHtml}
                ${historyHtml}
            </div>`;
        },

        async _avsReroll() {
            const storyId = window.VN_Core?._currentStoryId || '';
            if (!storyId) return;
            try {
                const allChs = await win.OS_DB?.getAllVnChapters?.() || [];
                const storyChs = allChs.filter(c => c.storyId === storyId).sort((a, b) => (b.createdAt||0) - (a.createdAt||0));
                if (!storyChs.length) return;
                const lastCh = storyChs[0];
                if (!lastCh.avsStateBefore) return;

                // 刪除最後一章
                await win.OS_DB?.deleteVnChapter?.(lastCh.id);

                // 還原 AVS 狀態到章節開始前
                const stateKey = `avs_state_${storyId}`;
                localStorage.setItem(stateKey, JSON.stringify(lastCh.avsStateBefore));
                if (win.dispatchEvent) win.dispatchEvent(new CustomEvent('AVS_VARS_UPDATED', { detail: lastCh.avsStateBefore }));

                console.log('[AVS] ↩ 回朔成功，刪除章節:', lastCh.title || lastCh.id);
            } catch(e) {
                console.error('[AVS] 回朔失敗:', e);
            }
        },

        _walletHtml() {
            const eco = win.OS_ECONOMY;
            if (!eco) return '<div style="padding:30px;text-align:center;color:#999">OS_ECONOMY 未載入</div>';
            const data = eco.data || {};
            const balance = data.balance ?? 0;
            const DEFS = { vip_silver:{name:'不夜城白銀卡',icon:'🥈'}, vip_gold:{name:'不夜城黃金卡',icon:'👑'}, vip_black:{name:'黑曜石無限卡',icon:'💳'}, gang_pass:{name:'地下通行證',icon:'☠️'} };
            const cards = (data.cards||[]).map(id => { const d=DEFS[id]||{name:id,icon:'💳'}; return `<span style="margin-right:10px">${d.icon} ${d.name}</span>`; }).join('') || '<span style="color:#666;font-size:12px">無持有卡片</span>';
            const txRows = (data.transactions||[]).slice(0,20).map(t => `
                <tr><td style="color:#aaa;font-size:11px;font-family:monospace">${t.time}</td>
                <td style="color:${t.amount>=0?'#00d2d3':'#ff4757'};text-align:right;font-family:monospace;font-weight:bold">${t.amount>=0?'+':''}${t.amount.toLocaleString()}</td>
                <td>${t.reason}</td></tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:#666;padding:16px">尚無交易紀錄</td></tr>`;
            return `
                <div style="text-align:center;padding:20px 0 16px">
                    <div style="font-size:11px;color:#aaa;letter-spacing:3px;margin-bottom:8px">BALANCE</div>
                    <div style="font-size:38px;font-weight:bold;color:#d4af37;font-family:'Courier New',monospace">$${balance.toLocaleString()}</div>
                </div>
                <div style="padding:0 0 16px;border-bottom:1px solid rgba(212,175,55,0.15)">
                    <div style="font-size:10px;color:#d4af37;letter-spacing:2px;margin-bottom:8px">MY CARDS</div>${cards}
                </div>
                <div style="padding:16px 0 8px">
                    <div style="font-size:10px;color:#d4af37;letter-spacing:2px;margin-bottom:10px">TRANSACTIONS</div>
                    <table class="ue-md-table"><thead><tr><th>時間</th><th style="text-align:right">金額</th><th>說明</th></tr></thead><tbody>${txRows}</tbody></table>
                </div>`;
        },

        _mdToHtml(md) {
            if (!md) return '';
            const lines = md.split('\n');
            let html = '', tableLines = [], inTable = false;
            const flush = () => {
                if (!tableLines.length) return;
                const parse = l => l.split('|').filter((c,i,a)=>i>0&&i<a.length-1).map(c=>c.trim());
                const heads = parse(tableLines[0]);
                const body  = tableLines.slice(2);
                html += `<table class="ue-md-table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;
                html += `<tbody>${body.map(l=>`<tr>${parse(l).map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
                tableLines = []; inTable = false;
            };
            for (const line of lines) {
                const t = line.trim();
                if (t.startsWith('|')) { inTable = true; tableLines.push(t); }
                else {
                    if (inTable) flush();
                    if      (t.startsWith('### ')) html += `<h4 style="color:#d4af37;margin:10px 0 4px;font-size:12px">${t.slice(4)}</h4>`;
                    else if (t.startsWith('## '))  html += `<h3 style="color:#d4af37;margin:12px 0 6px;font-size:13px">${t.slice(3)}</h3>`;
                    else if (t.startsWith('# '))   html += `<h2 style="color:#d4af37;margin:14px 0 8px;font-size:15px">${t.slice(2)}</h2>`;
                    else if (t) html += `<p style="font-size:12px;color:#e8dfc8;margin:3px 0">${t}</p>`;
                }
            }
            if (inTable) flush();
            return html;
        },

    };
    window.VN_StandaloneArchive = VN_StandaloneArchive;
})();
