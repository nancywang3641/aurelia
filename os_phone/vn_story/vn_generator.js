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

    // ── 🎭 角色卡 Dive ──────────────────────────────────────────
    //  這一段以前是「開一個生成面板 → 把 prompt 填進它的輸入框 → 模擬按下送出」。
    //  那個面板同時兼了三個身分：UI、參數通道（用按鈕的 dataset 當變數）、完成偵測
    //  （MutationObserver 監看送出鈕的 disabled）。三件事綁死在同一組 DOM 上，
    //  於是每一條入口都得先把面板叫出來才生得成，面板一動全部跟著壞。
    //  現在拆開：組 prompt 是純函式、參數走 generateStory 的參數、進度走回呼。

    function _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    //  角色卡＋開場白 → 給模型看的指令。純字串處理，不碰畫面。
    function _buildCardPrompt(w, greeting, userReply) {
        let request;
        if (greeting && userReply) {
            request = '請以下列對話情境為基礎，生成 VN 視覺小說格式的開場章節。\n\n'
                    + '【角色開場白】\n' + greeting + '\n\n'
                    + '【用戶的第一句回應】\n' + userReply + '\n\n'
                    + '請從此對話後繼續發展劇情，讓角色自然地回應用戶的話語。';
        } else if (greeting) {
            request = '請以下列開場白情境為基礎，生成 VN 視覺小說格式的開場章節：\n\n' + greeting;
        } else {
            request = '請以角色「' + w.title + '」的世界觀生成 VN 視覺小說格式的開場章節。';
        }
        return { title: w.title, request: request };
    }

    //  生成中的遮罩。以前它掛在生成面板內部 —— 面板不在，就完全沒有進度可看；
    //  現在掛在 VN 頁本身，跟你從哪個入口進來無關。
    function _diveLoading(w, greeting, userReply) {
        const host = document.getElementById('page-game') || document.body;
        const old = document.getElementById('vn-dive-loading');
        if (old) old.remove();
        const box = document.createElement('div');
        box.id = 'vn-dive-loading';
        box.className = 'vn-dive-loading';
        const g = String(greeting || ''), r = String(userReply || '');
        box.innerHTML =
            '<div class="vdl-icon">' + _esc((w && w.icon) || '📖') + '</div>' +
            '<div class="vdl-title">' + _esc((w && w.title) || '') + '</div>' +
            (g ? '<div class="vdl-quote">「' + _esc(g.slice(0, 90)) + (g.length > 90 ? '…' : '') + '」</div>' : '') +
            (r ? '<div class="vdl-reply">你：「' + _esc(r.slice(0, 60)) + (r.length > 60 ? '…' : '') + '」</div>' : '') +
            '<div class="vdl-status"><span class="gen-spinner"></span>AI 正在編織故事，請稍候…</div>';
        host.appendChild(box);
        return {
            fail: function (msg) {
                const st = box.querySelector('.vdl-status');
                if (st) st.innerHTML = '<span class="vdl-err">' + _esc(String(msg || '生成失敗，請重試').replace(/^❌\s*/, '')) + '</span>';
                if (!box.querySelector('.vdl-close')) {
                    const b = document.createElement('button');
                    b.type = 'button'; b.className = 'vdl-close'; b.textContent = '關閉';
                    b.onclick = function () { box.remove(); };
                    box.appendChild(b);
                }
            },
            done: function () { box.remove(); },
        };
    }

    //  角色卡 Dive 的唯一入口：書架點下去就走這裡，不必再叫出任何面板。
    function runCardDive(p) {
        p = p || {};
        const w = (window.AURELIA_CUSTOM_WORLDS || []).find(x => x && x.id === p.worldId);
        if (!w) { console.warn('[VN] 找不到這張角色卡：', p.worldId); return false; }
        const greeting = p.greeting || '', userReply = p.userReply || '';
        localStorage.setItem('vn_current_world_id', w.id);
        localStorage.removeItem('vn_pending_first_mes');
        if (w.autoPackId && win.OS_AVS && win.OS_AVS.activateTemplateForPack) {
            try { win.OS_AVS.activateTemplateForPack(w.autoPackId); } catch (e) {}
        }
        const built = _buildCardPrompt(w, greeting, userReply);
        const ui = _diveLoading(w, greeting, userReply);
        let failed = false;
        generateStory({
            title: built.title,
            request: built.request,
            targetPackId: w.autoPackId || null,
            onStatus: function (text, cls) { if (cls === 'err') { failed = true; ui.fail(text); } },
            onDone: function () { if (!failed) ui.done(); },
        });
        return true;
    }

    //  自由劇情／QB 那類「我自己有輸入介面」的入口：直接把值交進來就好。
    function runFreeDive(opts) {
        opts = opts || {};
        const request = String(opts.request || '').trim();
        if (!request) return false;
        generateStory({
            title: opts.title || '',
            request: request,
            targetPackId: opts.targetPackId || null,
            onStatus: opts.onStatus,
            onDone: opts.onDone,
        });
        return true;
    }

    //  以前這兩個是生成面板裡的 DOM（狀態列與送出鈕）。面板拆掉後換成兩個小殼子：
    //  接住同樣的賦值，轉成呼叫端給的回呼 —— generateStory 內文那十幾處寫法一行都不用改。
    function _ghostStatus(onStatus) {
        let t = '', c = '';
        const fire = function () { if (typeof onStatus === 'function') { try { onStatus(t, c); } catch (e) {} } };
        return {
            set textContent(v) { t = String(v == null ? '' : v); fire(); },
            get textContent() { return t; },
            set innerHTML(v) { t = String(v == null ? '' : v); fire(); },
            get innerHTML() { return t; },
            set className(v) { c = String(v == null ? '' : v); fire(); },
            get className() { return c; },
        };
    }
    function _ghostBtn(onDone) {
        let d = false;
        return {
            // 由「鎖住」回到「可按」＝這一輪跑完了。原本的完成偵測就是監看這個屬性，
            // 只是它得掛一個 MutationObserver 在真的按鈕上才辦得到。
            set disabled(v) {
                const was = d; d = !!v;
                if (was && !d && typeof onDone === 'function') { try { onDone(); } catch (e) {} }
            },
            get disabled() { return d; },
        };
    }

    // 🌟 【重構】加上 options = {} 參數與 async 關鍵字
    async function generateStory(options = {}) {
        // 面板已經拆掉：這兩個殼子接住內文原本對 DOM 的賦值，轉給呼叫端的回呼
        const submitBtn = _ghostBtn(options.onDone);
        const statusEl  = _ghostStatus(options.onStatus);
        // 🚨呼叫端可以直接把值傳進來，不必先去填那個 overlay 的輸入框。
        //   舊路徑（書架自由劇情、QB Dive）都是「填 DOM → 按下去」，等於整條生成綁死在
        //   那個面板的 DOM 上：面板一改版或收起來，別的入口就跟著壞。
        //   不傳就完全照舊讀 DOM，既有呼叫端零影響。
        const request     = String(options.request || '').trim();
        const presetTitle = String(options.title || '').trim();

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
                // id 已在書架踏入時生好（runCardDive 那條路也是），這裡只換標題
                if (!window.VN_Core._currentStoryId || window.VN_Core._currentStoryId === '__new_story__') {
                    window.VN_Core.newStoryId(storyTitle, '');
                } else {
                    window.VN_Core.renameStory(storyTitle);
                }
                const storyId = window.VN_Core._currentStoryId;

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
                try { window.VN_Core.earlybirdFromText(fullText); } catch (e) {}  // 頭像早鳥：先開生
                window.VN_Core._startWithLoader(fullText, null);   // 載入→loading 等全部圖片→開播
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

            // ⛔ 不再寫 '__new_story__' 這個哨兵：故事線的 id 已經在書架踏入的那一刻生好了
            //   （見 VN_Core.newStoryId）。這裡再蓋一個假鑰匙的話，整輪生成期間所有按
            //   storyId 分艙的讀寫（數值、記憶、手機資料）又會掉進同一個共用桶。
            //   沒有 id 才自己補一條（例如舊入口直接呼叫生成器）。
            if (!window.VN_Core._currentStoryId || window.VN_Core._currentStoryId === '__new_story__') {
                window.VN_Core.newStoryId(presetTitle || '未命名故事', '');
            }

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
                            // 正文吐出 [Story|標題] → 只換標題，id 沿用踏入時生的那個。
                            //   （酒館的 chatId 也不會因為劇情改名而換掉，存檔身分要穩定）
                            window.VN_Core.renameStory(storyTitle);
                            const storyId = window.VN_Core._currentStoryId;

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

                        // 🗑️ 這裡原本呼叫 _saveGenPreset()：拆生成面板那次(ede76f2)把定義刪了、呼叫漏刪，
                        //    帶標題的 dive 一跑到這行就 ReferenceError → 後面的 switchPage / _startWithLoader
                        //    全被中斷，畫面就停在白底。具名收藏現在由書架自己存（qb_bookshelf._savePreset）。

                        window.VN_Core._lastRawText = fullText;
                        if (window.VN_PLAYER?.switchPage) window.VN_PLAYER.switchPage('page-game');
                        closeGeneratePanel();
                        try { window.VN_Core.earlybirdFromText(fullText); } catch (e) {}  // 頭像早鳥：先開生
                        window.VN_Core._startWithLoader(fullText, null);   // 載入→loading 等全部圖片→開播
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
    //  openGeneratePanel / closeGeneratePanel / diveSelectedCard 已隨生成面板一起移除。
    //  對外只剩三個：兩個入口（角色卡 Dive、自有輸入介面的 Dive）＋ 生成本身。
    window.VN_Generator = { generateStory, runCardDive, runFreeDive };
})();
