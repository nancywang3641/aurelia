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
        // 🚨 #page-game 在模板裡預設 class="page hidden"，沒 switchPage 就是隱藏的。
        //    遮罩掛進一個隱藏的頁＝什麼都看不到，畫面就是一片黑（Rae 看到的「黑屏沒 loading」）。
        //    先揭開這一頁，等一下生成完成的 switchPage 只是重複做一次，無害。
        try { window.VN_PLAYER?.switchPage?.('page-game'); } catch (e) { }
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
        // 🚨 掛不到舞台時**不要**退到 document.body：body 沒有定位，絕對定位的遮罩會跑到
        //    面板底下去，等於整段生成都看不到進度（畫面就是空舞台一直亮著）。
        //    舞台是 launchApp 建的，慢一步就等它出現再掛。
        const _mount = (tries) => {
            const h = document.getElementById('page-game');
            if (h) { h.appendChild(box); return; }
            if ((tries || 0) < 60) { setTimeout(() => _mount((tries || 0) + 1), 50); return; }
            console.warn('[VN] 等不到 VN 舞台（#page-game），這次 dive 沒有進度可看');
        };
        _mount(0);
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
        // 遮罩收不收，兩道保險：
        //   ① onDone（generateStory 內部把「生成中」放掉時觸發）
        //   ② generateStory 這顆 promise 落地 —— 萬一內部漏了 ①，遮罩也不會永遠掛在畫面上
        generateStory({
            title: built.title,
            request: built.request,
            targetPackId: w.autoPackId || null,
            onStatus: function (text, cls) { if (cls === 'err') { failed = true; ui.fail(text); } },
            onDone: function () { if (!failed) ui.done(); },
        }).then(function () { if (!failed) ui.done(); }, function () {});
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
    // ══════════════════════════════════════════════════════════════
    // ⚠️ 壞回覆判定（獨立版）
    // ──────────────────────────────────────────────────────────────
    // 酒館那條靠 GENERATION_ENDED + 讀聊天樓判斷,獨立版沒有那兩樣 —— 但我們手上就有剛回來的
    // 全文,直接判更準。兩種要攔:
    //   ① API 錯誤頁被當正文回傳(OS_API 只有「完全空」才 throw,504/憑證錯誤那種是「表面成功」的文字)
    //   ② 正文被截斷(有 <content> 沒 </content>) —— 破甲被切、模型中途停都會這樣
    // 以前這裡的處置是「長度 > 50 就自己補上 <content> 包起來」→ 半截正文照樣存成章節,
    // 還會連帶餵給 AVS/記憶/插圖。這種降級掩蓋才是最難查的：畫面上只是「這章怪怪的」。
    // ══════════════════════════════════════════════════════════════
    function _noCot(t) { return String(t == null ? '' : t).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, ''); }

    // 把「續寫回來的片段」接回半截正文：續寫是接在斷點後面的，不是新的一章。
    //   模型常會自己又開一個 <content>（或再寫一次 [Chapter|]）→ 接之前先剝掉，不然正文會多一層標籤。
    //   接完仍然沒有 </content> ＝ 又被截一次 → 交給 _badReply 再跳一次橫幅，可以連續續寫。
    function _stitchContinuation(partial, cont) {
        let c = _noCot(String(cont || '')).trim();
        c = c.replace(/^[\s\S]{0,200}?<content>\s*/i, '');   // 續段自己又開的 <content>（含前面那點客套話）剝掉
        c = c.replace(/^\s*\[(?:Chapter|Story)\|[^\]]*\]\s*/i, '');   // 又重寫一次章節標頭也剝掉
        let base = String(partial || '');
        return base.replace(/\s*$/, '') + '\n' + c;
    }

    function _badReply(t) {
        const s = (t == null) ? '' : String(t);
        if (!s.trim()) return { bad: true, kind: 'empty', reason: '回應是空的（可能逾時或被中斷）' };
        const head = s.slice(0, 400);
        if (/^\s*\[\s*API\s*(錯誤|Error)\s*\]/i.test(s)) return { bad: true, kind: 'api', reason: head.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) };
        if (/(endpoint|request)\s+failed\s+with\s+status\s+\d{3}/i.test(head)) return { bad: true, kind: 'api', reason: head.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) };
        if (s.length < 1500 && /gateway timeout|bad gateway|service unavailable|the request could not be satisfied|we can'?t connect to the server|invalid_credentials|Authentication required/i.test(s))
            return { bad: true, kind: 'api', reason: 'API 回了錯誤頁（如 504 逾時 / 憑證問題），不是正常內容' };
        const c = _noCot(s);
        const hasOpen = c.indexOf('<content>') !== -1, hasClose = c.indexOf('</content>') !== -1;
        // ⚔️ 戰鬥交棒天生沒有 </content>（世界書要求輸出 </BattleStart> 就停筆）→ 不算截斷
        if (hasOpen && !hasClose && !/<\/BattleStart>/i.test(c)) return { bad: true, kind: 'trunc', reason: '正文沒收到結尾（缺 </content>）' };
        if (!hasOpen && s.trim().length < 50) return { bad: true, kind: 'empty', reason: '回應內容不足' };
        return { bad: false };
    }

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
                        // 續寫回來的片段先接回半截正文，再一起驗貨（驗的是接完的完整章節，不是那個片段）
                        if (options._continueFrom) fullText = _stitchContinuation(options._continueFrom, fullText);
                        // ⚠️ 先驗貨再落地：壞的一律不存章節（存了就會連帶餵 AVS／記憶／插圖，還要回頭刪）
                        const _bad = _badReply(fullText);
                        if (_bad.bad) {
                            console.warn('[VN_Gen] ⚠️ 這輪回覆有問題（' + _bad.kind + '）：' + _bad.reason);
                            _showBadReplyBanner(_bad, fullText, options);
                            statusEl.textContent = '⚠️ ' + _bad.reason;
                            statusEl.className = 'err';
                            submitBtn.disabled = false;
                            try { window.VN_Core._hideWriterCurtain(); } catch (e) {}
                            resolve();   // 不當成 throw：橫幅已經接手，這裡靜靜收尾別再彈一次錯
                            return;
                        }
                        if (!fullText.includes('<content>')) fullText = `<content>\n${fullText}\n</content>`;   // 沒標籤但內容夠長＝模型忘了包，補上

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

                        // 生成面板拆掉後遺留的兩行呼叫(_saveGenPreset / closeGeneratePanel)已移除：
                        // 定義早就沒了，走到就 ReferenceError 把後面的開播整條打斷。
                        // 具名收藏由書架自己存；生成遮罩由 onDone → ui.done() 收。

                        window.VN_Core._lastRawText = fullText;
                        if (window.VN_PLAYER?.switchPage) window.VN_PLAYER.switchPage('page-game');
                        try { window.VN_Core.earlybirdFromText(fullText); } catch (e) {}  // 頭像早鳥：先開生
                        window.VN_Core._startWithLoader(fullText, null);   // 載入→loading 等全部圖片→開播
                        // 🚨 這一行以前沒有：成功路徑從來沒把「生成中」放掉，
                        //    而 onDone 正是靠 disabled 由 true→false 觸發（_ghostBtn）→ 生成遮罩永遠不收，
                        //    劇情其實已經在遮罩後面播了。只有失敗那條 catch 會放掉，所以「失敗反而會收」。
                        //    放在 _startWithLoader 之後：校準艙（要等圖時）已經接手，中間不會露出空舞台。
                        submitBtn.disabled = false;
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

    // ⚠️ 壞回覆橫幅（UI 用 VN_Core 那份共用的，行為在這裡給）：
    //   重新生成 ＝ 拿同一組 options 再跑一次（等同酒館的 /regenerate）
    //   繼續生成 ＝ 把半截正文丟回去請它接著寫完,再把兩段接起來（等同 /continue）；只有截斷才給
    function _showBadReplyBanner(bad, partial, options) {
        showBadBanner(bad, {
            onRegen: function () { generateStory(options); },
            // 下一次續寫的底本是「接到目前為止的整份」→ 可以連續續好幾次，不會退回最初那半截
            onContinue: function () { _continueTruncated(partial, options); },
        });
    }

    // 橫幅本身跟「這一輪是怎麼發出去的」無關 → 抽出來給別條生成路徑共用（見檔尾 window.VN_Generator）。
    //   兩顆按鈕的行為由呼叫端給：只有截斷才給「繼續生成」，API 錯誤頁續寫沒有意義。
    function showBadBanner(bad, handlers) {
        const VC = window.VN_Core;
        if (!VC?.showTruncBanner) { alert(bad.reason); return; }
        VC.showTruncBanner({
            title: bad.kind === 'trunc' ? '⚠️ 正文被截斷' : '⚠️ 這輪沒生成成功',
            sub: bad.reason,
            onRegen: handlers?.onRegen || null,
            onContinue: (bad.kind === 'trunc' && handlers?.onContinue) ? handlers.onContinue : null,
        });
    }

    // 續寫用的系統指令：跟 _continueTruncated 同一份文案，別條路徑自己組 request 時共用
    function continueRequest(partial) {
        return [
            '（系統：上一輪的正文被截斷了。請「接著」下面這段往下寫完，不要重寫、不要重複已經寫過的內容，不要重新開場，直接從斷點接下去，並且務必補上 </content> 收尾。）',
            '',
            '【被截斷的正文尾段】',
            String(partial || '').slice(-1500),
        ].join('\n');
    }

    // 接續：把半截正文交回主模型續寫,只要「接下去的部分」,回來自己接起來再走一次正常落地。
    //   走 generateStory 的完成路徑(不另寫一套存檔),所以續回來的內容照樣會過壞回覆判定。
    async function _continueTruncated(partial, options) {
        await generateStory(Object.assign({}, options, {
            request: continueRequest(partial),
            _continueFrom: partial,   // 交給完成路徑接起來
        }));
    }

    // === 暴露到全域 ===
    //  openGeneratePanel / closeGeneratePanel / diveSelectedCard 已隨生成面板一起移除。
    //  對外只剩三個：兩個入口（角色卡 Dive、自有輸入介面的 Dive）＋ 生成本身。
    //  後四個是給「不走 generateStory 的生成路徑」共用的守門零件（點選項推進劇情就是一條）：
    //  壞回覆的判定/橫幅/接合只能有一份，各寫各的＝哪條路沒裝橫幅只會靜靜把半截正文存成章節。
    window.VN_Generator = {
        generateStory, runCardDive, runFreeDive,
        checkReply: _badReply,
        showBadBanner,
        stitchContinuation: _stitchContinuation,
        continueRequest,
    };
})();
