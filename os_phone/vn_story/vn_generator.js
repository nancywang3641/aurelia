// ----------------------------------------------------------------
// [檔案] vn_generator.js
// 路徑：os_phone/vn_story/vn_generator.js
// 職責：VN 視覺小說播放器 - 獨立 API 生成模組
//       (開場白預設 / 角色卡 Dive / 生成劇情 / 生成面板開關)
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：(運行期) VN_Core, OS_API, OS_SETTINGS, OS_DB, OS_THINK, OS_AVS, OS_ECONOMY
//       (HTML 跳頁) window.VN_PLAYER.switchPage
// 暴露：window.VN_Generator
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 獨立生成模組 (vn_generator.js)...');
    const win = window.parent || window;

    // ── 開場白預設儲存（localStorage） ──
    const GEN_PRESETS_KEY = 'os_vn_gen_presets';

    function _loadGenPresets() {
        try { return JSON.parse(localStorage.getItem(GEN_PRESETS_KEY) || '[]'); } catch(e) { return []; }
    }
    function _saveGenPreset(title, request) {
        const list = _loadGenPresets().filter(p => p.title !== title);
        list.unshift({ title, request, savedAt: Date.now() });
        localStorage.setItem(GEN_PRESETS_KEY, JSON.stringify(list));
    }
    function _deleteGenPreset(title) {
        const list = _loadGenPresets().filter(p => p.title !== title);
        localStorage.setItem(GEN_PRESETS_KEY, JSON.stringify(list));
    }
    function _renderGenPresets() {
        const container = document.getElementById('vn-gen-presets');
        const countEl   = document.getElementById('vn-gen-presets-count');
        if (!container) return;
        const list = _loadGenPresets();
        if (countEl) countEl.textContent = list.length ? `共 ${list.length} 筆` : '';
        container.innerHTML = '';
        list.forEach(p => {
            const item = document.createElement('div');
            item.className = 'vn-gen-preset-item';
            item.innerHTML = `
                <div class="vn-gen-preset-load" title="${p.request.replace(/"/g,'&quot;').slice(0,120)}">${p.title}</div>
                <div class="vn-gen-preset-del" title="刪除">✕</div>`;
            item.querySelector('.vn-gen-preset-load').onclick = () => {
                const titleEl = document.getElementById('vn-gen-title');
                const reqEl   = document.getElementById('vn-gen-request');
                if (titleEl) titleEl.value = p.title;
                if (reqEl)   reqEl.value   = p.request;
            };
            item.querySelector('.vn-gen-preset-del').onclick = (e) => {
                e.stopPropagation();
                _deleteGenPreset(p.title);
                _renderGenPresets();
            };
            container.appendChild(item);
        });
    }

    function openGeneratePanel() {
        const overlay = document.getElementById('vn-gen-overlay');
        if (!overlay) return;
        // 不是從書籍 dive 進來，清除殘留世界書，避免繼承上一本書的 worldbook
        if (!window._pendingCardDive && !window._pendingQBPayload) {
            localStorage.removeItem('vn_active_wb_packs');
            localStorage.removeItem('vn_current_world_id');
        }
        document.getElementById('vn-gen-status').textContent = '';
        document.getElementById('vn-gen-status').className = '';
        document.getElementById('vn-gen-submit').disabled = false;
        overlay.classList.add('active');
        _renderGenPresets();
        _renderCardCol();   // 每次開啟都刷新右欄角色卡
        setTimeout(() => {
            const ta = document.getElementById('vn-gen-request');
            if (ta) ta.focus();
        }, 350);
    }

    // ── 角色卡紀錄 helpers ──────────────────────────────────────
    const _CARD_SESSIONS_KEY = 'vn_card_sessions';
    function _loadCardSessions() {
        try { return JSON.parse(localStorage.getItem(_CARD_SESSIONS_KEY) || '[]'); } catch(e) { return []; }
    }
    function _saveCardSession(worldId, worldTitle, greeting) {
        const sessions = _loadCardSessions();
        sessions.unshift({ id: `cs_${Date.now()}`, worldId, worldTitle, greeting, ts: Date.now() });
        // 同角色同開場白去重（只保留最新一筆）
        const seen = new Set();
        const deduped = sessions.filter(s => {
            const key = s.worldId + '|' + (s.greeting || '').slice(0, 30);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        localStorage.setItem(_CARD_SESSIONS_KEY, JSON.stringify(deduped.slice(0, 50)));
    }
    function _deleteCardSession(id) {
        const sessions = _loadCardSessions().filter(s => s.id !== id);
        localStorage.setItem(_CARD_SESSIONS_KEY, JSON.stringify(sessions));
    }

    // 渲染右欄：書架角色卡紀錄（格式：角色名 - 開場白描述）
    function _renderCardCol() {
        const list    = document.getElementById('vn-gen-card-list');
        const diveBtn = document.getElementById('vn-gen-card-dive');
        if (!list) return;

        // ── 必須在任何 early-return 之前處理 pending ──────────────
        // 否則 sessions 為空時 return 提前，_pendingCardDive 永遠不觸發
        if (window._pendingCardDive) {
            const p = window._pendingCardDive;
            window._pendingCardDive = null;          // 先清除，防止遞迴循環
            _saveCardSession(p.worldId, p.title, p.greeting);
            // 預設 diveBtn（diveSelectedCard 依賴此 dataset）
            if (diveBtn) {
                diveBtn.dataset.wid       = p.worldId;
                diveBtn.dataset.greeting  = p.greeting  || '';
                diveBtn.dataset.userReply = p.userReply || '';
            }
            _renderCardCol();                        // 重繪列表（此時 pending 已 null）
            setTimeout(() => diveSelectedCard(), 150);
            return;
        }
        // ────────────────────────────────────────────────────────

        const sessions = _loadCardSessions();
        list.innerHTML = '';
        if (diveBtn) diveBtn.classList.remove('visible');

        if (!sessions.length) {
            list.innerHTML = '<div id="vn-gen-card-empty">尚無書架角色卡紀錄<br><span style="font-size:0.68rem;opacity:0.5;">從書架點「與TA相遇」即會產生紀錄</span></div>';
            return;
        }

        sessions.forEach(s => {
            const item = document.createElement('div');
            item.className = 'vn-gen-card-item';
            const greetLabel = s.greeting
                ? s.greeting.slice(0, 40) + (s.greeting.length > 40 ? '…' : '')
                : '（AI 自由發揮）';
            item.innerHTML = `
                <div class="vn-gen-card-info" style="flex:1;min-width:0;">
                    <div class="vn-gen-card-source">${s.worldTitle}</div>
                    <div class="vn-gen-card-desc">${greetLabel}</div>
                </div>
                <button class="vn-card-del-btn" data-sid="${s.id}"
                    style="flex-shrink:0;background:none;border:none;color:rgba(255,255,255,0.25);
                           font-size:0.75rem;cursor:pointer;padding:0 2px;line-height:1;"
                    title="刪除此紀錄">✕</button>
            `;
            item.querySelector('.vn-card-del-btn').onclick = e => {
                e.stopPropagation();
                _deleteCardSession(s.id);
                _renderCardCol();
            };
            const _selectItem = () => {
                list.querySelectorAll('.vn-gen-card-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                if (diveBtn) {
                    diveBtn.dataset.wid      = s.worldId;
                    diveBtn.dataset.greeting = s.greeting || '';
                    diveBtn.classList.add('visible');
                }
            };
            item.onclick = _selectItem;
            list.appendChild(item);
        });
    }

    // 角色卡 DIVE：存紀錄 → 直接傳遞參數給生成器 (拔除 localStorage 貼布)
    function diveSelectedCard() {
        const diveBtn  = document.getElementById('vn-gen-card-dive');
        const wid       = diveBtn?.dataset.wid;
        const greeting  = diveBtn?.dataset.greeting  || '';
        const userReply = diveBtn?.dataset.userReply || '';
        if (!wid) return;
        const w = (window.AURELIA_CUSTOM_WORLDS || []).find(x => x.id === wid);
        if (!w) return;

        // 存紀錄到右欄
        _saveCardSession(w.id, w.title, greeting);

        // 世界 ID → buildContext 取世界書 + 條件規則
        localStorage.setItem('vn_current_world_id', w.id);
        localStorage.removeItem('vn_pending_first_mes');

        // 🌟 【重構】把變數包 ID 打包成選項參數
        const diveOptions = {
            targetPackId: w.autoPackId || null
        };

        // 激活展廳面板可以先做，這只影響 UI 顯示
        if (w.autoPackId && win.OS_AVS?.activateTemplateForPack) {
            win.OS_AVS.activateTemplateForPack(w.autoPackId);
        }

        // 靜默填入 vn-gen-request
        const genInput = document.getElementById('vn-gen-request');
        const genTitle = document.getElementById('vn-gen-title');
        if (genInput) {
            if (greeting && userReply) {
                genInput.value =
                    `請以下列對話情境為基礎，生成 VN 視覺小說格式的開場章節。\n\n` +
                    `【角色開場白】\n${greeting}\n\n` +
                    `【用戶的第一句回應】\n${userReply}\n\n` +
                    `請從此對話後繼續發展劇情，讓角色自然地回應用戶的話語。`;
            } else if (greeting) {
                genInput.value = `請以下列開場白情境為基礎，生成 VN 視覺小說格式的開場章節：\n\n${greeting}`;
            } else {
                genInput.value = `請以角色「${w.title}」的世界觀生成 VN 視覺小說格式的開場章節。`;
            }
        }
        if (genTitle) genTitle.value = w.title;

        // ── 顯示全板生成中 Loading ────
        const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const genWindow = document.getElementById('vn-gen-window');
        const LOAD_ID   = 'vn-card-dive-loading';
        let   loadDiv   = document.getElementById(LOAD_ID);
        if (!loadDiv && genWindow) {
            loadDiv = document.createElement('div');
            loadDiv.id = LOAD_ID;
            loadDiv.style.cssText = [
                'position:absolute;inset:0;z-index:20;border-radius:inherit;',
                'background:rgba(8,6,4,0.97);',
                'display:flex;flex-direction:column;align-items:center;justify-content:center;',
                'gap:14px;text-align:center;padding:36px;'
            ].join('');
            const greetPreview = greeting
                ? `<div style="font-size:11.5px;color:rgba(255,248,231,0.3);max-width:260px;
                               line-height:1.75;font-style:italic;margin-top:4px;
                               display:-webkit-box;-webkit-line-clamp:3;
                               -webkit-box-orient:vertical;overflow:hidden;">
                       「${_esc(greeting.slice(0, 90))}${greeting.length > 90 ? '…' : ''}」
                   </div>` : '';
            const replyPreview = userReply
                ? `<div style="font-size:11px;color:rgba(150,200,255,0.4);max-width:260px;
                               line-height:1.6;margin-top:-4px;
                               display:-webkit-box;-webkit-line-clamp:2;
                               -webkit-box-orient:vertical;overflow:hidden;">
                       你：「${_esc(userReply.slice(0, 60))}${userReply.length > 60 ? '…' : ''}」
                   </div>` : '';
            loadDiv.innerHTML = `
                <div style="font-size:44px;filter:drop-shadow(0 2px 14px rgba(212,175,55,0.45));">${_esc(w.icon)}</div>
                <div style="font-size:17px;font-weight:900;color:#1A1C28;letter-spacing:3px;">${_esc(w.title)}</div>
                ${greetPreview}
                ${replyPreview}
                <div id="vn-card-dive-status" style="display:flex;align-items:center;gap:8px;
                     font-size:12px;color:rgba(212,175,55,0.75);margin-top:6px;">
                    <span class="gen-spinner"></span>AI 正在編織故事，請稍候…
                </div>
            `;
            genWindow.style.position = 'relative';
            genWindow.appendChild(loadDiv);
        }

        const submitBtn = document.getElementById('vn-gen-submit');
        if (submitBtn) {
            const _obs = new MutationObserver(() => {
                if (!submitBtn.disabled) {
                    _obs.disconnect();
                    const ld = document.getElementById(LOAD_ID);
                    if (!ld) return;
                    const ds = document.getElementById('vn-card-dive-status');
                    if (ds) {
                        const errMsg = document.getElementById('vn-gen-status')?.textContent || '生成失敗，請重試';
                        ds.innerHTML = `<span style="color:rgba(255,90,90,0.9);">❌ ${_esc(errMsg.replace(/^❌\s*/,''))}</span>`;
                    }
                    if (!ld.querySelector('#vn-card-dive-retry')) {
                        const retryBtn = document.createElement('button');
                        retryBtn.id = 'vn-card-dive-retry';
                        retryBtn.textContent = '關閉';
                        retryBtn.style.cssText = [
                            'margin-top:8px;padding:9px 28px;border-radius:4px;cursor:pointer;',
                            'border:1px solid rgba(212,175,55,0.35);',
                            'background:rgba(212,175,55,0.12);color:#1A1C28;font-size:12px;'
                        ].join('');
                        retryBtn.onclick = () => ld.remove();
                        ld.appendChild(retryBtn);
                    }
                }
            });
            _obs.observe(submitBtn, { attributes: true, attributeFilter: ['disabled'] });
        }

        // 🌟 把選項傳遞給生成器
        generateStory(diveOptions);
    }

    function closeGeneratePanel() {
        const overlay = document.getElementById('vn-gen-overlay');
        if (overlay) overlay.classList.remove('active');
        const pageGame = document.getElementById('page-game');
        if (pageGame && pageGame.classList.contains('hidden')) {
            if (window.AureliaControlCenter?.hideVnPanel) window.AureliaControlCenter.hideVnPanel();
        }
    }

    // 🌟 【重構】加上 options = {} 參數與 async 關鍵字
    async function generateStory(options = {}) {
        const submitBtn = document.getElementById('vn-gen-submit');
        const statusEl  = document.getElementById('vn-gen-status');
        const request   = (document.getElementById('vn-gen-request')?.value || '').trim();
        const presetTitle = (document.getElementById('vn-gen-title')?.value || '').trim();

        // 🌟 接收傳遞過來的變數包 ID
        const targetPackId = options.targetPackId || null;

        if (!win.OS_API) {
            statusEl.textContent = '❌ OS_API 未載入，請重整頁面';
            statusEl.className = 'err';
            return;
        }

        // ── 角色卡開場白直通：跳過 API，直接用 first_mes ──────
        const _pendingFirstMes = localStorage.getItem('vn_pending_first_mes');
        if (_pendingFirstMes) {
            localStorage.removeItem('vn_pending_first_mes');
            submitBtn.disabled = true;
            statusEl.innerHTML = '<span class="gen-spinner"></span>載入角色開場白…';
            statusEl.className = '';
            try {
                const fullText = _pendingFirstMes.includes('<content>')
                    ? _pendingFirstMes
                    : `<content>\n${_pendingFirstMes}\n</content>`;
                const now        = Date.now();
                const storyTitle = window.VN_Core._extractStoryTitle(fullText)
                    || presetTitle
                    || localStorage.getItem('vn_current_story_title')
                    || '角色開場';
                const storyId    = `${storyTitle}_${now}`;
                window.VN_Core._setStoryId(storyId, storyTitle);

                // 🌟 【重構】直接使用手上的 targetPackId
                if (win.dispatchEvent) {
                    win.dispatchEvent(new CustomEvent('VN_STORY_STARTED', {
                        detail: { entityId: storyId, title: storyTitle, packId: targetPackId }
                    }));
                }

                const avsStateBefore = win._AVS_ENGINE?.read?.() || {};
                await win.OS_DB.saveVnChapter({
                    title:    '第一章：相遇',
                    storyId,
                    storyTitle,
                    content:  fullText,
                    request:  request || '角色卡開場白',
                    thinking: '',
                    createdAt: now,
                    avsStateBefore,
                });
                window.VN_Core._lastRawText = fullText;
                if (window.VN_PLAYER?.switchPage) window.VN_PLAYER.switchPage('page-game');
                closeGeneratePanel();
                window.VN_Core._showStartLoader(4000, () => window.VN_Core._loadWithSceneAnalysis(fullText, null));
                console.log('[VN_Gen] ✅ 角色卡開場白直通成功，變數已透過參數直接初始化');
            } catch(e) {
                console.error('[VN_Gen] 開場白載入失敗:', e);
                statusEl.textContent = `❌ 載入失敗：${e.message}`;
                statusEl.className = 'err';
                submitBtn.disabled = false;
            }
            return;
        }

        const config = (win.OS_SETTINGS?.getConfig?.()) || {};
        if (!config.url && !config.useSystemApi) {
            statusEl.innerHTML = '❌ 尚未設定 API。請先到 <b>設置 → 🧠 主模型</b> 填入 API URL 與 Key。';
            statusEl.className = 'err';
            return;
        }

        submitBtn.disabled = true;
        statusEl.innerHTML = '<span class="gen-spinner"></span>AI 生成中，請稍候...';
        statusEl.className = '';

        let _prevStoryId    = window.VN_Core._currentStoryId;
        let _prevStoryTitle = window.VN_Core._currentStoryTitle;

        try {
            const userMsg = request || '請根據現有世界觀與角色設定，自由創作一段沉浸式互動劇情。';
            if (win.OS_THINK) win.OS_THINK.setContext({ panel: 'VN 劇情生成', userInput: userMsg });

            window.VN_Core._setStoryId('__new_story__', '');

            const messages = await win.OS_API.buildContext(userMsg, 'vn_story');

            await new Promise((resolve, reject) => {
                win.OS_API.chat(
                    messages,
                    config,
                    null,
                    async (fullText) => {
                        if (!fullText || !fullText.includes('<content>')) {
                            if (fullText && fullText.length > 50) {
                                fullText = `<content>\n${fullText}\n</content>`;
                            } else {
                                reject(new Error('AI 回應內容不足或格式錯誤'));
                                return;
                            }
                        }

                        try {
                            const titleMatch = fullText.match(/\[Chapter\|(?:\d+\|)?([^\]|]+)\]/i)
                                            || fullText.match(/\[Story\|([^\]]+)\]/i);
                            const title = titleMatch ? titleMatch[1].trim() : `章節 ${new Date().toLocaleString('zh-TW')}`;
                            let _thinking = win.OS_THINK?.getLatest()?.content?.trim() || '';
                            // 酒館模式 OS_THINK 抓不到 → 讀酒館原生 reasoning（extra.reasoning）
                            if (!_thinking) _thinking = (win.AureliaAPI || window.AureliaAPI)?.getLatestReasoning?.() || '';

                            const now = Date.now();
                            const storyTitle = window.VN_Core._extractStoryTitle(fullText) || presetTitle || '未命名故事';
                            const storyId    = `${storyTitle}_${now}`;

                            window.VN_Core._setStoryId(storyId, storyTitle);

                            // 🌟 【重構】AI 生成完畢，直接使用手上的 targetPackId 初始化
                            if (win.dispatchEvent) {
                                win.dispatchEvent(new CustomEvent('VN_STORY_STARTED', {
                                    detail: { entityId: storyId, title: storyTitle, packId: targetPackId }
                                }));
                            }

                            const avsStateBefore = win._AVS_ENGINE?.read?.() || {};

                            await win.OS_DB.saveVnChapter({
                                title,
                                storyId,
                                storyTitle,
                                content: fullText,
                                request: request || '',
                                thinking: _thinking,
                                createdAt: now,
                                avsStateBefore
                            });
                        } catch(e) {
                            console.warn('[VN_Gen] 存檔失敗（不影響播放）:', e);
                        }

                        if (win.OS_ECONOMY && typeof win.OS_ECONOMY.processAiTransaction === 'function') {
                            const statusMatch = fullText.match(/<status>([\s\S]*?)<\/status>/i);
                            if (statusMatch) {
                                const txLines = statusMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
                                for (const line of txLines) {
                                    const parts = line.split('|').map(s => s.trim());
                                    if (parts.length >= 3 && /^T\d+$/i.test(parts[0])) {
                                        win.OS_ECONOMY.processAiTransaction(parts[0], parts[1], parts[2]);
                                    }
                                }
                            }
                        }

                        if (presetTitle) _saveGenPreset(presetTitle, request);

                        window.VN_Core._lastRawText = fullText;
                        if (window.VN_PLAYER?.switchPage) window.VN_PLAYER.switchPage('page-game');
                        closeGeneratePanel();
                        window.VN_Core._showStartLoader(6000, () => window.VN_Core._loadWithSceneAnalysis(fullText, null));
                        resolve();
                    },
                    (err) => reject(err),
                    { disableTyping: true }
                );
            });

        } catch (err) {
            console.error('[VN_Gen] 生成失敗:', err);
            statusEl.textContent = `❌ 生成失敗：${err.message || '未知錯誤'}`;
            statusEl.className = 'err';
            submitBtn.disabled = false;
            window.VN_Core._setStoryId(_prevStoryId, _prevStoryTitle);
        }
    }

    // === 暴露到全域 ===
    window.VN_Generator = {
        openGeneratePanel, closeGeneratePanel, generateStory, diveSelectedCard
    };
})();
