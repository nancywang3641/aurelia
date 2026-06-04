// ----------------------------------------------------------------
// [檔案] vn_core.js (V8.6 - 模組化重構版 + SFX 音效防重疊與5秒限制 + 世界書頭像擴展 + 主頁背景音樂)
// 路徑：os_phone/vn_story/vn_core.js
// 職責：VN 視覺小說播放器 - 核心功能與主邏輯
// ⚠️ 依賴 vn_styles.js 與 vn_phone.js，必須在其之後載入
// ----------------------------------------------------------------
(function () {
    console.log('[PhoneOS] 載入 VN 視覺小說播放器 (V8.6 - 核心模組化 + SFX優化 + 世界書頭像 + 主頁BGM)...');
    const win = window.parent || window;


    // === 從子模組取出 short-name 別名（vn_cache/vn_config/vn_monitor/vn_summary/
    //     vn_sticker/vn_panels/vn_generator 必須在本檔之前載入） ===
    const VN_Cache       = window.VN_Cache;
    const VN_Config      = window.VN_Config;
    const VN_PromptOrder = window.VN_PromptOrder;
    const VN_BgmIndex    = win.VN_BgmIndex;
    const VN_Image       = window.VN_Image;
    const VN_CtxMonitor  = window.VN_CtxMonitor;
    const VN_Summary     = win.VN_Summary;
    const VN_Sticker     = window.VN_Sticker;
    const VN_Settings    = window.VN_Settings;

    // panel 函式（vn_panels.js）
    const {
        openGameSettings, closeGameSettings,
        openChatBgPanel, closeChatBgPanel, handleChatBgFile, applyChatBgUrl, clearChatBg, loadSavedChatBg,
        loadAvatarManager, loadBgManager, loadSpriteManager,
        openChapterPanel, closeChapterPanel
    } = window.VN_Panels;

    // 生成器函式（vn_generator.js）
    const {
        openGeneratePanel, closeGeneratePanel, generateStory, diveSelectedCard
    } = window.VN_Generator;

    // === 3. 核心腳本邏輯 ===
    const VN_Core = {
        script: [], index: -1, avatars: {}, currentName: '', currentExp: '', mode: 'vn',
        _lastBgCacheId: '', // 跨章節持久，存 cacheId 而非 URL（blob 會被 resetState 撤銷）
        _bgMemCache: {},
        _sceneMemCache: {},
        _itemMemCache: {},
        _avatarMemCache: {},
        _pendingAvatars: {},
        _decodedImgs: {},
        _twTimer: null, _twEl: null, _twFull: '', _twSpeed: 30,
        _autoTimer: null,
        isSkip: false, skipDelay: 200, logHistory: [],
        // 故事分支識別（storyTitle_timestamp，每次新開場白產生新 ID）
        _currentStoryId:    localStorage.getItem('vn_current_story_id')    || '',
        _currentStoryTitle: localStorage.getItem('vn_current_story_title') || '',
        _extractStoryTitle: function(fullText) {
            const m = fullText.match(/\[Story\|([^\]]+)\]/i);
            return m ? m[1].trim() : '';
        },
        _setStoryId: function(storyId, storyTitle) {
            this._currentStoryId    = storyId;
            this._currentStoryTitle = storyTitle || '';
            localStorage.setItem('vn_current_story_id',    storyId    || '');
            localStorage.setItem('vn_current_story_title', storyTitle || '');
        },
        
        // 音效管理參數
        _currentSfxAudio: null,
        _sfxTimer: null,

        // 世界書頭像管理
        _lorebookAvatarCache: {},
        _lorebookLoaded: false,

        _loadLorebookAvatars: async function() {
            if (!win.TavernHelper) return;
            this._lorebookAvatarCache = {};
            try {
                const lbs = new Set();
                const settings = win.TavernHelper.getLorebookSettings();
                if (settings && settings.selected_global_lorebooks) {
                    settings.selected_global_lorebooks.forEach(lb => lbs.add(lb));
                }
                const charLbs = win.TavernHelper.getCharLorebooks();
                if (charLbs && charLbs.primary) lbs.add(charLbs.primary);
                if (charLbs && charLbs.additional) charLbs.additional.forEach(lb => lbs.add(lb));

                for (const lb of lbs) {
                    if (!lb) continue;
                    try {
                        const entries = await win.TavernHelper.getLorebookEntries(lb);
                        for (const entry of entries) {
                            if (entry.comment === '【素材-角色頭像素材】' || entry.comment === '【素材-隨機頭像素材】') {
                                const lines = (entry.content || '').split('\n');
                                for (const line of lines) {
                                    const trimmed = line.trim();
                                    if (!trimmed || trimmed.startsWith('//')) continue;
                                    const match = trimmed.match(/^([^:]+):([^|]+)(?:\|(.*))?$/);
                                    if (match) {
                                        const mainName = match[1].trim();
                                        const url = match[2].trim();
                                        this._lorebookAvatarCache[mainName] = url;
                                        if (match[3]) {
                                            match[3].split(',').forEach(alias => {
                                                const a = alias.trim();
                                                if (a) this._lorebookAvatarCache[a] = url;
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    } catch(e) {
                        console.warn(`[VN_Core] 無法讀取世界書: ${lb}`, e);
                    }
                }
                console.log('[VN_Core] 成功載入世界書頭像映射:', this._lorebookAvatarCache);
            } catch (e) {
                console.warn('[VN_Core] 載入世界書頭像失敗:', e);
            }
        },

        resetState: function() {
            this.clearTimers();
            this._twTimer = null;
            this._autoTimer = null;
            this._twEl = null;
            this._twFull = '';
            this.script = [];
            this.index = -1;
            this.avatars = {};
            // 清除殘留彈幕 DOM 並重置跑道
            const dc = document.getElementById('danmu-container');
            if (dc) dc.innerHTML = '';
            this._danmuLaneTs = [0,0,0,0,0,0,0];
            // 隱藏直播 header 與粉絲榜
            const sh = document.getElementById('stream-header');
            if (sh) sh.classList.add('hidden');
            const srp = document.getElementById('stream-rank-panel');
            if (srp) srp.classList.add('hidden');
            const ssr = document.getElementById('stream-scene-row');
            if (ssr) ssr.classList.add('hidden');

            this._lorebookAvatarCache = {};
            this._lorebookLoaded = false;
            this._domBlockCursor = 0;     // 第幾個自訂 DOM block（每次 loadScript 歸零）
            this._currentMessageId = null; // 當前訊息 ID，供從 .mes_text 抓 DOM
            // 重置動態 Parser 狀態 + 清除殘留 overlay（防止舊面板的 onComplete 汙染新章節）
            if (window.VN_DynamicParser) {
                window.VN_DynamicParser._inBlockId = null;
                window.VN_DynamicParser._blockLines = [];
            }
            document.querySelectorAll('.vn-dyn-overlay').forEach(el => el.remove());

            // 關閉選項 overlay（載入新/舊章節時清除殘留）
            const choiceOv = document.getElementById('vn-choice-overlay');
            if (choiceOv) choiceOv.classList.remove('active');

            for (const url of Object.values(this._bgMemCache)) {
                if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
            }
            this._bgMemCache = {};
            for (const url of Object.values(this._sceneMemCache)) {
                if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
            }
            this._sceneMemCache = {};
            for (const url of Object.values(this._itemMemCache)) {
                if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
            }
            this._itemMemCache = {};
            // ⚠️ avatars / _avatarMemCache 跨章節保留，不歸零
            // 原因：AI 上下文長了必然重複輸出同角色 profile，用程式碼去重比靠 prompt 規則可靠
            // 完整清除只在 stopGame() / 頁面重新整理時執行
            this._pendingAvatars = {};
            this._decodedImgs = {};
            this.currentName = '';
            this.currentExp = '';
            this.mode = 'vn';
            this.logHistory = [];
            this.isSkip = false;

            if (win.VN_Phone) win.VN_Phone.resetState();

            this.updateControlUI();

            const elsToClear = {
                'chat-body': '',
                'vn-log-content': '',
                'dialogue-text': '讀取中...',
                'call-sub-text': '',
                'call-sub-name': '',
                'top-badge': ''
            };
            for(let id in elsToClear) {
                const el = document.getElementById(id);
                if(el) el.innerHTML = elsToClear[id];
            }

            const hides = ['speaker-name', 'game-char', 'game-char-2', 'char-portrait', 'top-badge'];
            hides.forEach(id => {
                const el = document.getElementById(id);
                if(el) { el.style.display = 'none'; if (el.classList) el.classList.remove('vn-dim', 'vn-active', 'vn-solo', 'vn-avatar'); }
            });
            this._stage = [null, null]; this._stageTick = 0;   // 重置雙格舞台

            // 清除場景插圖 overlay（防止跨章節殘留）
            const sceneCgOverlay = document.getElementById('scene-cg-overlay');
            if (sceneCgOverlay) sceneCgOverlay.classList.remove('active');
            const sceneCgImg = document.getElementById('scene-cg-img');
            if (sceneCgImg) sceneCgImg.src = '';

            const bg = document.getElementById('game-bg');
            if (bg) {
                if (this._lastBgCacheId) {
                    // 有上一章背景：cacheId 存活，從 IDB 重新取 URL（blob 已被 resetState 撤銷）
                    this._setBgImage(bg, '');
                    const _cid = this._lastBgCacheId;
                    (async () => {
                        const cached = await VN_Cache.get('bg_cache', _cid);
                        if (cached && cached.url && bg) {
                            const objUrl = await this._toObjectUrl(cached.url).catch(() => null);
                            let finalUrl = objUrl || cached.url;
                            if (cached.fallback && !String(finalUrl).includes('#fallback')) finalUrl += '#fallback';
                            this._setBgImage(bg, finalUrl);
                        }
                    })();
                } else {
                    this._setBgImage(bg, '');
                }
            }

            ['sys-overlay', 'trans-overlay', 'item-overlay', 'phone-overlay', 'scene-cg-overlay'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.classList.remove('active');
            });

            const vnPanel = document.getElementById('text-panel-wrapper');
            if(vnPanel) vnPanel.style.display = 'block';

            const endOverlay = document.getElementById('vn-end-overlay');
            if(endOverlay) endOverlay.classList.remove('active');
        },

        stopSFX: function() {
            if (this._currentSfxAudio) {
                this._currentSfxAudio.pause();
                this._currentSfxAudio.currentTime = 0;
                this._currentSfxAudio = null;
            }
            if (this._sfxTimer) {
                clearTimeout(this._sfxTimer);
                this._sfxTimer = null;
            }
        },

        clearTimers: function() {
            if(this._twTimer) clearTimeout(this._twTimer);
            if(this._autoTimer) clearTimeout(this._autoTimer);
            // 當前進到下一句話，或重置狀態時，停止所有正在播放的音效
            this.stopSFX();
        },

        loadScript: function (txt, messageId) {
            // 新一輪劇本載入時，自動關閉檔案庫面板
            if (window.AureliaHtmlExtractor && window.AureliaHtmlExtractor.isVisible) {
                window.AureliaHtmlExtractor.hide();
            }
            this.resetState();
            this._currentMessageId = messageId || null; // resetState 後覆寫，確保拿到正確 ID
            // 🔄 學 PWA：重抓創作室（展廳）已啟用模板，確保跨視窗新增/啟用的 tag 生效。
            //    ⚠️ 不可 await（呼叫端是 loadScript()→next() 同步契約，await 會讓 next() 在空腳本上跑→劇情跳過）。
            //    fire-and-forget：本次載入吃現有快取，刷新供後續播放/下次開播用。
            try { if (window.VN_DynamicParser && window.VN_DynamicParser.init) window.VN_DynamicParser.init(); } catch (e) {}
            // 🎨 套用此世界(chatId)的自訂 VN 面板 CSS
            try { if (window.VN_Theme) window.VN_Theme.apply(); } catch (e) {}
            const contentMatch = txt.match(/<content>([\s\S]*?)<\/content>/i);
            let storyText = contentMatch ? contentMatch[1] : txt;

            // 解析 <branches> 區塊（位於 <content> 外，作為一次性選擇，不進入 AI 上下文）
            const branchesMatch = txt.match(/<branches>([\s\S]*?)<\/branches>/i);
            const _branchLines = branchesMatch
                ? branchesMatch[1].split('\n')
                    .map(l => l.trim())
                    .filter(Boolean) // 過濾掉空行
                    .map(l => {
                        // 向下相容：如果 AI 還是輸出了舊格式，就直接保留
                        if (l.startsWith('[Choice|')) return l;
                        // 智能轉換：將 "A. 探險" 或 "1. 探險" 或 "- 探險" 自動轉成系統讀得懂的 [Choice|探險]
                        const cleanLine = l.replace(/^([A-Za-z]\.|[0-9]+\.|-)\s*/, '');
                        return `[Choice|${cleanLine}]`;
                    })
                : [];

            this.script = storyText.split('\n').map(l=>l.trim()).filter(l=>l!=='');
            // 移除 HTML 註解行（如作者思維鏈 <!-- 分析內容 --> 等），含跨行註解
            this.script = this.script.join('\n').replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l=>l.trim()).filter(l=>l!=='');
            this.script = this.script.map(l => l.replace(/<\/?status>/g, '').replace(/<\/?content>/g, ''));

            // 預處理：移除外部作者區塊標籤內的原始文字行
            // 這些行的內容由 DOM 渲染版本呈現（_showDomBlock），原文不需出現在對話框
            {
                const _skipSys = ['content','call','chat','status','summary','avatar','scene',
                    'p','div','span','br','hr','b','i','em','strong','a','img',
                    'ul','ol','li','table','tr','td','th','thead','tbody','tfoot',
                    'h1','h2','h3','h4','h5','h6','blockquote','pre','code','section','aside'];

                // 🌟 神奇魔法：動態抓取煉丹爐已啟用的區塊標籤
                if (window.VN_DynamicParser && window.VN_DynamicParser.activeTemplates) {
                    window.VN_DynamicParser.activeTemplates.forEach(tpl => {
                        if (tpl.isBlock && tpl.tagId) _skipSys.push(tpl.tagId.toLowerCase());
                    });
                }

                // _inDynBlock：追蹤「動態 Parser 區塊」（煉丹爐標籤，如 <StellarFeed>）
                // 這類區塊的內容必須完整保留，讓 vn_dynamic_parser 的 processLine 自行收集；
                // 不能讓格式B過濾器（[Timeline]、[Hot] 等節區標記）誤判為 DOM Block 並刪除後續內容。
                let _inBlock = false, _bCloseTag = '';
                let _inDynBlock = false, _dynCloseTag = '';
                this.script = this.script.filter(l => {
                    // ── 優先：動態 Parser 區塊保護層 ──────────────────────────
                    if (_inDynBlock) {
                        if (l === _dynCloseTag) { _inDynBlock = false; _dynCloseTag = ''; }
                        return true; // 區塊內所有行（含節區標記與結束標籤）一律保留
                    }

                    if (!_inBlock) {
                        // 格式A 開頭 <XXX>
                        const _oA = l.match(/^<([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff-]*)>$/);
                        if (_oA) {
                            if (_skipSys.includes(_oA[1].toLowerCase())) {
                                // 這是已知的動態 Parser 區塊 → 切換到保護模式，完整保留
                                _inDynBlock = true; _dynCloseTag = `</${_oA[1]}>`;
                                return true;
                            } else {
                                // 未知 XML 區塊 → 走原本的 DOM Block 過濾
                                _inBlock = true; _bCloseTag = `</${_oA[1]}>`;
                                return true; // 保留開頭標籤行
                            }
                        }
                        // 格式B 開頭 [XXX]（僅在非動態區塊時觸發）
                        const _oB = l.match(/^\[([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff-]*)\]$/);
                        if (_oB) {
                            _inBlock = true; _bCloseTag = `[/${_oB[1]}]`;
                            return true; // 保留開頭標籤行
                        }
                        return true; // 正常 VN 行，保留
                    } else {
                        if (l === _bCloseTag) { _inBlock = false; _bCloseTag = ''; return true; } // 保留閉合標籤
                        return false; // 區塊內的原始文字，過濾掉
                    }
                });
            }

            const txtString = txt;

            // 1. 舊式 <avatar> 區塊（向下相容）
            const reg = /<avatar>([\s\S]*?)<\/avatar>/g; let m;
            while ((m = reg.exec(txtString)) !== null) {
                m[1].split('\n').forEach(l => { if(l.includes(':')) { const [n, d] = l.split(':'); this.avatars[n.trim()] = d.trim(); } });
            }

            // 將 <branches> 選項附加到 script 末尾（由現有 [Choice|] 機制驅動顯示）
            if (_branchLines.length) {
                this.script.push(..._branchLines);
            }

            this._hoistSceneDirectivesFromDynBlocks();  // 卡片區塊內的 [BGM]/[Bg] 提副本到區塊前，讓引擎照常播
            this._prewarmBgs();
            this._prewarmScenes();
            this._prewarmItems();
            this._prewarmAvatars();
            this._prewarmSoVITS();
        },

        /**
         * 獨立版場景插圖：先送副模型分析，拿到增強版文本後再 loadScript + next
         * 若未啟用或非獨立模式，直接走原本流程
         * @param {string}   text      原始劇情文本
         * @param {string|null} msgId  訊息 ID（獨立版通常為 null）
         */
        _loadWithSceneAnalysis: function(text, msgId) {
            const _isStandalone = (win.OS_API?.isStandalone?.()) ?? false;
            const _sceneCfg = (win.OS_SETTINGS?.getImageConfig?.())?.sceneGen || {};
            if (_isStandalone && _sceneCfg.enabled && win.OS_API?.analyzeSceneInserts) {
                win.OS_API.analyzeSceneInserts(
                    text,
                    (enhanced) => {
                        this.loadScript(enhanced || text, msgId);
                        this.next();
                    }
                );
            } else {
                this.loadScript(text, msgId);
                this.next();
            }
        },

        /**
         * 顯示 loading bar，滿後執行 onDone（預設啟動 VN）
         * 給外部插件預留注入時間（如圖片生成插件）
         */
        _showStartLoader: function(ms, onDone) {
            const gamePage = document.getElementById('page-game');
            if (!gamePage) { if (onDone) onDone(); return; }

            if (!document.getElementById('vn-sl-style')) {
                const s = document.createElement('style');
                s.id = 'vn-sl-style';
                s.textContent = '#vn-start-loader{position:absolute;inset:0;z-index:900;background:#050402;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}' +
                    '#vn-start-loader-track{width:60%;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden}' +
                    '#vn-start-loader-bar{height:100%;width:0%;background:#d4af37;border-radius:2px;transition:width linear}' +
                    '#vn-start-loader-label{font-size:10px;letter-spacing:3px;color:rgba(212,175,55,0.5);text-transform:uppercase}';
                document.head.appendChild(s);
            }

            let el = document.getElementById('vn-start-loader');
            if (!el) {
                el = document.createElement('div');
                el.id = 'vn-start-loader';
                el.innerHTML = '<div id="vn-start-loader-track"><div id="vn-start-loader-bar"></div></div><div id="vn-start-loader-label">Loading</div>';
                gamePage.appendChild(el);
            }

            const bar = el.querySelector('#vn-start-loader-bar');
            bar.style.transition = 'none';
            bar.style.width = '0%';
            void bar.offsetWidth;
            bar.style.transition = 'width ' + ms + 'ms linear';
            bar.style.width = '100%';

            setTimeout(function() {
                el.style.display = 'none';
                if (onDone) onDone();
            }, ms);
        },

        /**
         * 顯示第 N 個自訂 DOM block（與 html_extractor「其他擴展與物件」相同邏輯）
         * 由 next() 偵測到外部標籤時呼叫，對應計數器 _domBlockCursor
         */
        // tagHint：觸發此次 DOM block 的 VN 標籤名（可選）
        // 用於排除 ST 渲染後與 VN 標籤同名的 HTML 元素（避免把 AI 的 <news> 當作注入內容計數）
        // 拿一段文字（整顆區塊）去酒館正則對照表找「卡片型」規則，命中就用 replace_string 渲染成卡片 HTML。
        // 支援任意格式的區塊（<tag>…</tag>、【…|…】 等），因為是拿整段去比對 find_regex，不靠 tag 名。
        // 回傳：完整 HTML 文件→包成 iframe；一般 HTML→直接回傳；沒命中→ ''。
        _grabRegexCardHtml: function(blockText) {
            if (!blockText) return '';
            // 🔥 學 PWA：先吃創作室（展廳）已啟用模板，沒命中才去酒館正則。
            //    酒館正則只是給「別人角色卡自帶的卡片」用；自己在創作室建/啟用的 tag 不該被迫複製去酒館正則。
            try {
                const _dp = window.VN_DynamicParser;
                if (_dp && Array.isArray(_dp.activeTemplates) && _dp.activeTemplates.length) {
                    const _tm = String(blockText).match(/<\s*([A-Za-z0-9_-]+)[\s>]/);
                    if (_tm) {
                        const _tpl = _dp.activeTemplates.find(t => t.tagId && t.html &&
                            t.tagId.toLowerCase() === _tm[1].toLowerCase());
                        if (_tpl) {
                            // 注入該模板 CSS（同一 tag 只注入一次）
                            if (_tpl.css) {
                                const _cid = 'vn-dyn-tpl-' + _tpl.tagId.toLowerCase();
                                if (!document.getElementById(_cid)) {
                                    const _s = document.createElement('style');
                                    _s.id = _cid; _s.textContent = _tpl.css;
                                    document.head.appendChild(_s);
                                }
                            }
                            let _h = _tpl.html;
                            // 正則型：用 regexString 抓 {{1}}、{{2}} 佔位（與 _renderInline 同邏輯）
                            if (_tpl.regexString) {
                                try {
                                    const _rs = String(_tpl.regexString).replace(/^\^/, '').replace(/\$$/, '');
                                    const _m = String(blockText).match(new RegExp(_rs, 'i'));
                                    if (_m) for (let i = 1; i < _m.length; i++) _h = _h.split('{{' + i + '}}').join((_m[i] || '').trim());
                                } catch (e) {}
                            }
                            return _h;
                        }
                    }
                }
            } catch (e) {}
            const _win = window.parent || window;
            const _th = (_win && _win.TavernHelper) || window.TavernHelper;
            if (!_th || typeof _th.getTavernRegexes !== 'function') return '';
            // 把 "/pattern/flags" 字串轉成 RegExp（酒館 find_regex 是這個格式）
            const _parseRegex = (str) => {
                if (!str) return null;
                try {
                    const m = String(str).match(/^\/([\s\S]*)\/([a-z]*)$/i);
                    if (m) return new RegExp(m[1], (m[2] || '').replace(/g/g, ''));
                    return new RegExp(str, 'i');
                } catch (e) { return null; }
            };
            let _regexes = [];
            try { _regexes = _regexes.concat(_th.getTavernRegexes({ type: 'global' }) || []); } catch (e) {}
            try { _regexes = _regexes.concat(_th.getTavernRegexes({ type: 'character', name: 'current' }) || []); } catch (e) {}
            try { _regexes = _regexes.concat(_th.getTavernRegexes({ type: 'preset', name: 'in_use' }) || []); } catch (e) {}
            for (const r of _regexes) {
                if (!r || r.enabled === false || !r.find_regex) continue;
                const _rs = r.replace_string || '';
                // 只認「卡片型」規則（取代內容含任何 HTML 標籤），避免純文字替換或一般旁白被誤判成卡片
                if (!/<[a-z!\/]/i.test(_rs)) continue;
                const _fr = _parseRegex(r.find_regex);
                if (!_fr || !_fr.test(blockText)) continue;
                _fr.lastIndex = 0;
                let _card = String(blockText).replace(_fr, _rs);
                // 去掉 ```html 圍欄
                _card = _card.replace(/^\s*```html\s*/i, '').replace(/```\s*$/, '').trim();
                // 完整 HTML 文件 → 包成 iframe（讓內嵌 <script> / 完整文件正常渲染，等同酒館做法）
                if (/<!DOCTYPE|<html[\s>]|<body[\s>]/i.test(_card)) {
                    const _esc = _card.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                    return '<iframe class="vn-regex-card" scrolling="no" srcdoc="' + _esc + '"></iframe>';
                }
                return _card;
            }
            return '';
        },

        // tagHint：觸發的 <tag> 名（會去原始訊息撈整顆 <tag>…</tag> 來比對）
        // rawBlockOverride：直接給整段區塊文字（如 【…】 這種非 tag 形式）
        // precomputedHtml：偵測階段已算好的卡片 HTML（避免重複掃描正則）
        _showDomBlock: function(tagHint, rawBlockOverride, precomputedHtml) {
            const _win = window.parent || window;
            const _doc = _win.document || document;

            // 🔥 彈窗後「抓正則」(取代「抓 DOM」)：找配得上這段區塊的正則，用 replace_string 渲染；不靠 live DOM。
            let _regexCardHtml = precomputedHtml || '';
            if (!_regexCardHtml) {
                let _block = rawBlockOverride || '';
                if (!_block && tagHint) {
                    const _th = (_win && _win.TavernHelper) || window.TavernHelper;
                    if (_th && typeof _th.getChatMessages === 'function') {
                        try {
                            const _mid = (this._currentMessageId != null) ? this._currentMessageId : -1;
                            const _msg = _th.getChatMessages(_mid)[0];
                            const _raw = (_msg && _msg.message) || '';
                            const _bm = _raw.match(new RegExp('<' + tagHint + '\\b[^>]*>[\\s\\S]*?<\\/' + tagHint + '>', 'i'));
                            if (_bm) _block = _bm[0];
                        } catch (e) {}
                    }
                }
                if (_block) _regexCardHtml = this._grabRegexCardHtml(_block);
            }

            // 退路：override(【…】等非 tag) 沒命中 → 不彈窗，當普通行繼續；tag 模式沒命中 → 抓 DOM
            let chatNode = null;
            if (!_regexCardHtml) {
                if (rawBlockOverride) { this.next(); return; }
                chatNode = this._currentMessageId
                    ? _doc.querySelector(`.mes[mesid="${this._currentMessageId}"] .mes_text`)
                    : _doc.querySelector('#chat .mes.last_mes .mes_text');
                if (!chatNode) {
                    chatNode = this._currentMessageId
                        ? _doc.querySelector(`.mes[mesid="${this._currentMessageId}"]`)
                        : _doc.querySelector('#chat .mes.last_mes');
                }
                if (!chatNode) { this.next(); return; }
            }

            const tmpDiv = _doc.createElement('div');
            tmpDiv.innerHTML = _regexCardHtml || chatNode.innerHTML;

            // ▼▼▼ 暴力拆解法：無情斬斷 <content> 之前的所有內容 ▼▼▼
            const contentNode = tmpDiv.querySelector('content');
            if (contentNode) {
                // 1. 順藤摸瓜：從 <content> 往上找，直到找到 tmpDiv 的「第一層子節點」
                let topNode = contentNode;
                while (topNode.parentNode && topNode.parentNode !== tmpDiv) {
                    topNode = topNode.parentNode;
                }
                
                // 2. 斷頭台：把這個節點「上面」的所有兄弟節點（包含文字、標籤）全部物理抹殺
                let prev = topNode.previousSibling;
                while (prev) {
                    let trash = prev;
                    prev = prev.previousSibling;
                    trash.remove();
                }
                
                // 順手清掉防呆：如果 <content> 裡面剛好有包著 <think> (防 AI 發神經)
                tmpDiv.querySelectorAll('think, profile, status, branches').forEach(el => {
                    // 只殺掉在 content 外面，或是確定是無用裝飾的節點
                    if(!contentNode.contains(el)) el.remove(); 
                });
            }
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
            tmpDiv.querySelectorAll('img[src], video[src], source[src]').forEach(el => {
                try { if (el.src) el.setAttribute('src', el.src); } catch(e) {}
            });
            tmpDiv.querySelectorAll('a[href]').forEach(el => {
                try { if (el.href && !el.href.startsWith('javascript:')) el.setAttribute('href', el.href); } catch(e) {}
            });

            const _BT = ['DIV','TABLE','IFRAME','ASIDE','SECTION','DETAILS','UL','OL'];
            Array.from(tmpDiv.querySelectorAll('p')).forEach(p => {
                Array.from(p.children).forEach(ch => {
                    if (_BT.includes(ch.tagName.toUpperCase())) p.parentNode.insertBefore(ch, p);
                });
                if (!p.textContent.trim() && !p.children.length) p.remove();
            });
            // 原始邏輯：_BT 元素 或 有 class 的元素
            // 新增：非標準 HTML 標籤（如 <weverse_live_idol>）也視為 block
            const _STD = new Set(['A','ABBR','ADDRESS','ARTICLE','ASIDE','AUDIO','B','BLOCKQUOTE','BR',
                'BUTTON','CANVAS','CAPTION','CITE','CODE','COL','COLGROUP','DD','DEL','DETAILS','DFN',
                'DIALOG','DIV','DL','DT','EM','EMBED','FIELDSET','FIGCAPTION','FIGURE','FOOTER','FORM',
                'H1','H2','H3','H4','H5','H6','HEADER','HR','I','IFRAME','IMG','INPUT','INS','KBD',
                'LABEL','LEGEND','LI','MAIN','MAP','MARK','MENU','METER','NAV','OL','OPTGROUP','OPTION',
                'OUTPUT','P','PICTURE','PRE','PROGRESS','Q','RP','RT','RUBY','S','SAMP','SECTION',
                'SELECT','SMALL','SOURCE','SPAN','STRONG','SUB','SUMMARY','SUP','TABLE','TBODY','TD',
                'TEXTAREA','TFOOT','TH','THEAD','TIME','TR','TRACK','U','UL','VAR','VIDEO','WBR']);
            const _tagHintUp = tagHint ? tagHint.toUpperCase() : null;
            const blocks = Array.from(tmpDiv.children).filter(el => {
                const tag = el.tagName.toUpperCase();
                // 跳過與 VN 觸發標籤同名的元素（ST 渲染 AI 原始 XML 標籤後的殘影，不是插件注入的內容）
                if (_tagHintUp && tag === _tagHintUp) return false;
                return _BT.includes(tag) || (el.className && el.className.trim()) || !_STD.has(tag);
            });
            // 正則路徑：tmpDiv 只有目標那一顆卡，直接取，不動 _domBlockCursor（cursor 是給「抓 DOM」整則訊息計數用的）
            const domEl = _regexCardHtml
                ? (blocks[0] || tmpDiv.firstElementChild)
                : blocks[this._domBlockCursor++];
            if (!domEl) { this.next(); return; }

            // 注入樣式（只做一次）
            if (!document.getElementById('vn-dbo-style')) {
                const _s = document.createElement('style');
                _s.id = 'vn-dbo-style';
                _s.textContent = [
                    '#vn-dom-block-overlay{position:absolute;inset:0;z-index:600;background:rgba(5,4,2,0.93);',
                    'display:flex;flex-direction:column;justify-content:center;padding:20px 16px 14px;',
                    'transform:translateY(100%);transition:transform .35s cubic-bezier(.22,1,.36,1);overflow:hidden}',
                    '#vn-dom-block-overlay.active{transform:translateY(0)}',
                    '#vn-dom-block-body{max-height:calc(100% - 60px);overflow-y:auto;overflow-x:hidden;color:#e8dfc8}',
                    '#vn-dom-block-body::-webkit-scrollbar{width:3px}',
                    '#vn-dom-block-body::-webkit-scrollbar-thumb{background:rgba(212,175,55,.3);border-radius:2px}',
                    /* 確保圖片（如 SD 插件的 sd-ui-image）在缺少原插件 CSS 時仍可見 */
                    '#vn-dom-block-body img{max-width:100%;height:auto;display:block;margin:0 auto;border-radius:6px}',
                    '#vn-dom-block-body>div,#vn-dom-block-body>section,#vn-dom-block-body>article{display:block;width:100%}',
                    '.vn-regex-card{width:100%;border:0;display:block;background:transparent}',
                    '#vn-dom-block-hint{flex-shrink:0;margin-top:16px;text-align:center;',
                    'color:rgba(180,180,180,0.45);font-size:11px;letter-spacing:1px;pointer-events:none}'
                ].join('');
                document.head.appendChild(_s);
            }

            // 建立 overlay（只做一次，之後重複使用）
            let overlay = document.getElementById('vn-dom-block-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'vn-dom-block-overlay';
                overlay.innerHTML = '<div id="vn-dom-block-body"></div><div id="vn-dom-block-hint">點擊背景關閉</div>';
                overlay.onclick = (e) => { if (e.target === overlay) this._hideDomBlock(); };
                const gamePage = document.getElementById('page-game');
                if (!gamePage) { this.next(); return; }
                gamePage.appendChild(overlay);
            }

            // 注入關聯 <style> 標籤（作者透過正則編輯器同時注入了 CSS 和 HTML 面板）
            // <style> 被 blocks 過濾器排除，需要手動取出並寫入 VN iframe 的 document.head
            tmpDiv.querySelectorAll('style').forEach(styleEl => {
                const css = styleEl.textContent.trim();
                if (!css) return;
                // 用 CSS 內容哈希做 ID，同一份樣式只注入一次
                const _id = 'vn-dbo-ext-' + Math.abs(css.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
                if (!document.getElementById(_id)) {
                    const _s = document.createElement('style');
                    _s.id = _id;
                    _s.textContent = css;
                    document.head.appendChild(_s);
                }
            });

            document.getElementById('vn-dom-block-body').innerHTML = domEl.outerHTML;
            // 正則卡片(iframe)依內容自動撐高：避免固定高度留白，也免掉 iframe 內建醜滾動條（真的太高時溢出交給外層美化捲軸）
            const _vCardFrame = document.getElementById('vn-dom-block-body').querySelector('iframe.vn-regex-card');
            if (_vCardFrame) {
                const _fitFrame = () => {
                    try {
                        const _fd = _vCardFrame.contentDocument;
                        const _h = Math.max(_fd.body ? _fd.body.scrollHeight : 0, _fd.documentElement ? _fd.documentElement.scrollHeight : 0);
                        if (_h) _vCardFrame.style.height = _h + 'px';
                    } catch (e) { _vCardFrame.style.height = '70vh'; }
                };
                _vCardFrame.addEventListener('load', () => { _fitFrame(); setTimeout(_fitFrame, 400); });
                setTimeout(_fitFrame, 50);
            }
            void overlay.offsetWidth; // 強制 reflow 確保 transition 生效
            overlay.classList.add('active');
        },

        _hideDomBlock: function() {
            const overlay = document.getElementById('vn-dom-block-overlay');
            if (overlay) overlay.classList.remove('active');
            this.next();
        },

        // === 獨立模式：選擇按鈕 ===
        _showStandaloneChoices: function(line) {
            // 支援兩種格式：
            //   舊格式（向下相容）：[Choice|選項A|選項B|選項C]  ← 一行多選用 | 分隔
            //   新格式（推薦）：    [Choice|選項A]              ← 每條獨立一行，可寫完整句子
            //                     [Choice|選項B]
            //                     [Choice|選項C]
            const content = line.slice(8, -1);  // 去掉 [Choice| 和 ]
            let options = [];

            if (content.includes('|')) {
                // 舊格式：內容有 | → 直接 split
                options = content.split('|').map(s => s.trim()).filter(Boolean);
            } else {
                // 新格式：收集從當前行開始的所有連續 [Choice|...] 行
                if (content.trim()) options.push(content.trim());
                let nxt = this.index + 1;
                while (nxt < this.script.length && this.script[nxt].startsWith('[Choice|')) {
                    const opt = this.script[nxt].slice(8, -1).trim();
                    if (opt) options.push(opt);
                    nxt++;
                }
                this.index = nxt - 1;  // index 跳到最後一個 Choice 行
            }

            if (!options.length) { this.next(); return; }
            // 把選擇存入 Archive，然後打開資訊中心
            VN_StandaloneArchive._pendingChoices = options;
            VN_StandaloneArchive._choiceCallback = (text) => this._sendChoiceAndContinue(text);
            VN_StandaloneArchive.show();
        },

        _sendChoiceAndContinue: async function(choice) {
            const config = (win.OS_SETTINGS?.getConfig?.()) || {};
            if (!win.OS_API || (!config.url && !config.useSystemApi)) return;

            // loader 已由 doSend 在 Archive 關閉前就顯示好，這裡只確保 label 正確
            const _chkLbl = document.getElementById('vn-start-loader-label');
            if (_chkLbl) _chkLbl.textContent = 'AI 生成中...';

            try {
                if (win.OS_THINK) win.OS_THINK.setContext({ panel: 'VN 選項選擇', userInput: choice });
                const avsStateBefore = win._AVS_ENGINE?.read?.() || {};
                const messages = await win.OS_API.buildContext(choice, 'vn_story');
                await new Promise((resolve, reject) => {
                    win.OS_API.chat(messages, config, null, async (fullText) => {
                        // <status> 交易解析
                        if (win.OS_ECONOMY && typeof win.OS_ECONOMY.processAiTransaction === 'function') {
                            const sm = fullText.match(/<status>([\s\S]*?)<\/status>/i);
                            if (sm) sm[1].split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
                                const p = l.split('|').map(s => s.trim());
                                if (p.length >= 3 && /^T\d+$/i.test(p[0])) win.OS_ECONOMY.processAiTransaction(p[0], p[1], p[2]);
                            });
                        }
                        // 存檔（含思考鏈，沿用當前 storyId）
                        try {
                            const tm = fullText.match(/\[Chapter\|(?:\d+\|)?([^\]|]+)\]/i) || fullText.match(/\[Story\|([^\]]+)\]/i);
                            let _thinking = win.OS_THINK?.getLatest()?.content?.trim() || '';
                            // 酒館模式 OS_THINK 抓不到 → 讀酒館原生 reasoning（extra.reasoning）
                            if (!_thinking) _thinking = (win.AureliaAPI || window.AureliaAPI)?.getLatestReasoning?.() || '';
                            const _storyId    = window.VN_Core._currentStoryId    || '';
                            const _storyTitle = window.VN_Core._currentStoryTitle || '';
                            await win.OS_DB?.saveVnChapter({ title: tm ? tm[1].trim() : `選擇: ${choice}`, storyId: _storyId, storyTitle: _storyTitle, content: fullText, request: choice, thinking: _thinking, createdAt: Date.now(), avsStateBefore });
                        } catch(e) {}
                        
                        window.VN_Core._lastRawText = fullText;

                        // 2. 生成完畢，進度條衝到 100% 後關閉；場景分析（若啟用）在此期間完成
                        const loaderEl = document.getElementById('vn-start-loader');
                        const loaderBar = document.getElementById('vn-start-loader-bar');
                        if (loaderBar) {
                            loaderBar.style.transition = 'width 0.4s ease-out';
                            loaderBar.style.width = '100%';
                        }
                        setTimeout(() => {
                            if (loaderEl) loaderEl.style.display = 'none';
                            window.VN_Core._loadWithSceneAnalysis(fullText, null);
                        }, 500);
                        
                        resolve();
                    }, (err) => reject(err), { disableTyping: true });
                });
            } catch(err) {
                console.error('[VN_Choice] 生成失敗:', err);
                const loaderEl = document.getElementById('vn-start-loader');
                if (loaderEl) loaderEl.style.display = 'none';
                this.renderVN('', `*API 生成失敗，請檢查連線或設定。*\n\n錯誤訊息: ${err.message}`);
            }
        },

        _toDataUrl: function(url) {
            return new Promise((res) => {
                if (!url) return res('');
                if (!url.startsWith('blob:')) return res(url); 
                fetch(url)
                    .then(r => r.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onload  = () => res(reader.result);
                        reader.onerror = () => res('');
                        reader.readAsDataURL(blob);
                    })
                    .catch(() => res(''));
            });
        },

        _toObjectUrl: async function(source) {
            if (!source) return '';
            try {
                const res = await fetch(source);
                const blob = await res.blob();
                return URL.createObjectURL(blob);
            } catch(e) { return ''; }
        },

        // 測試用：console 跑 VN_Core.testFallback('描述', '黎明_候機大廳') 直接套一張 fallback 圖
        // 走完整 chain：Pixabay → LoremFlickr，回報哪個接住
        testFallback: async function(prompt, cacheId) {
            prompt = prompt || 'cafe interior daylight';
            console.log(`[VN] testFallback prompt: "${prompt}", cacheId: "${cacheId || '(無)'}"`);
            let url = await this._pixabayFallback(prompt, cacheId || '');
            let source = 'Pixabay';
            if (!url) { url = await this._loremFlickrFallback(prompt, cacheId || ''); source = 'LoremFlickr'; }
            if (!url) { console.error('[VN] testFallback: 兩個 fallback 都失敗'); return null; }
            console.log(`[VN] ✓ ${source} 接住:`, url);
            const bg = document.getElementById('game-bg');
            if (bg) this._setBgImage(bg, url + '#fallback');
            else console.warn('[VN] #game-bg 不存在，先進 VN 場景再測');
            return url;
        },

        // 統一 BG 套用：URL hash 標記 fallback 等級
        // #fallback        → 中度磨砂（Pixabay，圖經審核可看清場景）
        // #fallback-strong → 重度磨砂（LoremFlickr，圖未審核糊到只剩色塊氛圍）
        _setBgImage: function(el, url) {
            if (!el) return;
            if (url) {
                el.style.backgroundImage = `url('${url}')`;
                el.classList.toggle('bg-fallback', String(url).includes('#fallback'));
            } else {
                el.style.backgroundImage = 'none';
                el.classList.remove('bg-fallback');
            }
        },

        // 提取 fallback 用的英文關鍵字（cacheId 地點 → 翻譯 → 過濾 AI 修飾詞）
        _buildFallbackKeywords: async function(prompt, cacheId) {
            const pureTranslate = async (text) => {
                if (!text || !/[一-龥]/.test(text)) return text;
                if (win.TranslationManager?.translate) {
                    try { return await win.TranslationManager.translate(text, 'zh', 'en'); } catch (e) {}
                }
                return text;
            };

            let searchSrc = '';
            if (cacheId) {
                const idx = String(cacheId).indexOf('_');
                const place = idx >= 0 ? String(cacheId).slice(idx + 1) : String(cacheId);
                searchSrc = place.replace(/_/g, ' ').trim();
                searchSrc = await pureTranslate(searchSrc);
            }
            if (!searchSrc || !/[a-zA-Z]/.test(searchSrc)) {
                searchSrc = await pureTranslate(String(prompt || '').slice(0, 60));
            }

            const STOPWORDS = new Set([
                'photorealistic','realistic','photo','photography','cinematic','dramatic',
                'high','quality','best','detailed','intricate','masterpiece',
                '4k','8k','hd','uhd','ultra','sharp','focus','rendering','render',
                'illustration','painting','artwork','digital','art'
            ]);
            return String(searchSrc || '')
                .replace(/[^a-zA-Z0-9 ]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))
                .slice(0, 3);
        },

        // Pixabay 退路圖庫（高品質，需要 API key）
        _pixabayFallback: async function(prompt, cacheId) {
            const cfg = (win.OS_SETTINGS?.getImageConfig?.()) || {};
            const key = cfg.pixabayKey;
            if (!key) return '';

            const kwArr = await this._buildFallbackKeywords(prompt, cacheId);
            if (!kwArr.length) { console.warn('[VN] Pixabay: 沒英文關鍵字'); return ''; }
            const keywords = kwArr.join('+');
            try {
                const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(keywords)}&image_type=photo&orientation=horizontal&per_page=20&safesearch=true`;
                const res = await fetch(url);
                const json = await res.json();
                if (!json.hits || !json.hits.length) { console.warn('[VN] Pixabay 無匹配:', keywords); return ''; }
                const pick = json.hits[Math.floor(Math.random() * json.hits.length)];
                console.log(`[VN] Pixabay fallback hit: "${keywords}" → ${pick.tags || ''}`);
                return pick.largeImageURL || pick.webformatURL || '';
            } catch (e) {
                console.error('[VN] Pixabay fallback 失敗:', e);
                return '';
            }
        },

        // LoremFlickr 退路圖庫（免註冊，URL 直接帶關鍵字，最後一搏）
        _loremFlickrFallback: async function(prompt, cacheId) {
            const kwArr = await this._buildFallbackKeywords(prompt, cacheId);
            if (!kwArr.length) { console.warn('[VN] LoremFlickr: 沒英文關鍵字'); return ''; }
            // LoremFlickr 用逗號分隔多個關鍵字
            const tags = kwArr.join(',');
            const url = `https://loremflickr.com/1280/720/${encodeURIComponent(tags)}`;
            console.log(`[VN] LoremFlickr fallback: "${tags}" → ${url}`);
            return url;
        },

        _safeFetchBg: async function(cacheId, prompt) {
            if (this._bgMemCache[cacheId]) return this._bgMemCache[cacheId];
            const cached = await VN_Cache.get('bg_cache', cacheId);
            if (cached && cached.url) {
                if (cached.url.startsWith('blob:')) {
                    await VN_Cache.delete('bg_cache', cacheId);
                } else {
                    let displayUrl = cached.url;
                    if (cached.fallback) displayUrl = displayUrl.includes('#') ? displayUrl : displayUrl + '#fallback';
                    const objUrl = await this._toObjectUrl(cached.url);
                    this._bgMemCache[cacheId] = (objUrl || cached.url) + (cached.fallback ? '#fallback' : '');
                    this._preloadImg(cacheId, this._bgMemCache[cacheId]);
                    return this._bgMemCache[cacheId];
                }
            }
            const meta = {};
            // 強制 fallback 測試模式
            let forceFallback = false;
            try { forceFallback = JSON.parse(localStorage.getItem('os_image_config') || '{}').fallbackForce === true; } catch(e) {}

            // Pollinations 生圖 + 12 秒 timeout
            let raw = '';
            if (!forceFallback) {
                try {
                    raw = await Promise.race([
                        VN_Image.getBg(prompt, meta),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Pollinations timeout 12s')), 12000))
                    ]);
                } catch (e) {
                    console.warn('[VN] Pollinations 失敗，啟用 Pixabay fallback:', e.message);
                    raw = '';
                }
            }

            // Fallback chain：Pixabay (有 key) → LoremFlickr (永遠 work)
            let isFallback = false;
            if (!raw) {
                raw = await this._pixabayFallback(prompt, cacheId);
                if (raw) { isFallback = true; console.log('[VN] fallback source: Pixabay'); }
            }
            if (!raw) {
                raw = await this._loremFlickrFallback(prompt, cacheId);
                if (raw) { isFallback = true; console.log('[VN] fallback source: LoremFlickr'); }
            }
            if (!raw) return '';

            const savedPrompt = meta.translatedPrompt || prompt;
            try {
                const fetchRes = await fetch(raw);
                const blob = await fetchRes.blob();
                const objUrl = URL.createObjectURL(blob);
                const dataUrl = await new Promise(r => {
                    const reader = new FileReader();
                    reader.onload = () => r(reader.result);
                    reader.onerror = () => r('');
                    reader.readAsDataURL(blob);
                });
                const tagged = isFallback ? objUrl + '#fallback' : objUrl;
                this._bgMemCache[cacheId] = tagged;
                this._preloadImg(cacheId, tagged);
                if (dataUrl) await VN_Cache.set('bg_cache', cacheId, { prompt: savedPrompt, rawUrl: raw, url: dataUrl, fallback: isFallback });
                return tagged;
            } catch(e) {
                const url = await this._toDataUrl(raw);
                if (url) {
                    const tagged = isFallback ? url + '#fallback' : url;
                    this._bgMemCache[cacheId] = tagged;
                    this._preloadImg(cacheId, tagged);
                    await VN_Cache.set('bg_cache', cacheId, { prompt: savedPrompt, rawUrl: raw, url, fallback: isFallback });
                }
                return this._bgMemCache[cacheId] || '';
            }
        },

        _preloadImg: function(cacheId, url) {
            if (!url || this._decodedImgs[cacheId]) return;
            const img = new Image();
            img.src = url;
            if (typeof img.decode === 'function') {
                img.decode().catch(() => {}); 
            }
            this._decodedImgs[cacheId] = img; 
        },

        // 判斷 tag 是不是「動態標籤區塊」（創作室 isBlock 模板，如 <ChapterCard>）
        _isDynBlockTag: function(tag) {
            const dp = window.VN_DynamicParser;
            if (!dp || !dp.activeTemplates || !tag) return false;
            const t = tag.toLowerCase();
            return dp.activeTemplates.some(x => x.isBlock && x.tagId && x.tagId.toLowerCase() === t);
        },
        // 回傳 this.script 中「不在動態標籤區塊內」的行。
        // 動態區塊（如 <ChapterCard>）內容是「卡片資料」，裡面的 [Bg|]/[Item|]/[Scene|] 不是 VN 指令；
        // prewarm 預掃必須跳過，否則會把卡片資料當真背景/道具去生成 → 污染真實 VN 的 bg/bgm。
        _linesOutsideDynBlocks: function() {
            const out = [];
            let inBlock = false, closeTag = '';
            for (const line of this.script) {
                if (inBlock) { if (line === closeTag) inBlock = false; continue; }
                const m = line.match(/^<([A-Za-z一-鿿][\w一-鿿-]*)>$/);
                if (m && this._isDynBlockTag(m[1])) { inBlock = true; closeTag = '</' + m[1] + '>'; continue; }
                out.push(line);
            }
            return out;
        },
        // 卡片區塊（如 <ChapterCard>）裡若含真 VN 場景指令（[BGM]/[Bg]/[Scene]）→ 在區塊「前面」插入副本，
        // 讓 VN 引擎照常執行（播音樂、設背景）；區塊內原行仍被 processLine 收進卡片當顯示資料。
        // 解決：把開場 [BGM]/[Bg] 包進美化卡後，音樂/背景失效的問題（不包時正常、包了就被吞）。
        _hoistSceneDirectivesFromDynBlocks: function() {
            const SCENE = /^\[(BGM|Bg|Scene)\|/i;
            const out = [];
            let i = 0;
            while (i < this.script.length) {
                const line = this.script[i];
                const m = line.match(/^<([A-Za-z一-鿿][\w一-鿿-]*)>$/);
                if (m && this._isDynBlockTag(m[1])) {
                    const closeTag = '</' + m[1] + '>';
                    let j = i + 1;
                    while (j < this.script.length && this.script[j] !== closeTag) j++;
                    // 先吐場景指令副本（VN 引擎執行）
                    for (let k = i + 1; k < j; k++) { if (SCENE.test(this.script[k])) out.push(this.script[k]); }
                    // 再吐原區塊（open ~ close）給卡片渲染
                    for (let k = i; k <= j && k < this.script.length; k++) out.push(this.script[k]);
                    i = j + 1;
                } else {
                    out.push(line);
                    i++;
                }
            }
            this.script = out;
        },
        _prewarmBgs: function() {
            const tasks = [];
            const seen = new Set();
            for (const line of this._linesOutsideDynBlocks()) {
                if (!line.startsWith('[Bg|')) continue;
                const parts = line.slice(4, -1).split('|');
                const cacheId = parts[1];
                const prompt  = parts[2];
                if (!cacheId || !prompt || seen.has(cacheId)) continue;
                seen.add(cacheId);
                tasks.push({ cacheId, prompt });
            }
            if (!tasks.length) return;
            console.log(`[VN] 預熱背景：共 ${tasks.length} 張，依序生成中（含 fallback）...`);
            (async () => {
                for (const { cacheId, prompt } of tasks) {
                    await this._safeFetchBg(cacheId, prompt);
                }
                console.log('[VN] 所有背景預熱完成');
            })();
        },

        _prewarmItems: function() {
            const tasks = [];
            const seen = new Set();
            for (const line of this._linesOutsideDynBlocks()) {
                if (!line.startsWith('[Item|')) continue;
                const itemName = line.slice(6, -1).split('|')[0];
                if (!itemName || seen.has(itemName)) continue;
                seen.add(itemName);
                tasks.push(itemName);
            }
            if (!tasks.length) return;
            console.log(`[VN] 預熱道具圖：共 ${tasks.length} 張，依序生成中...`);
            (async () => {
                for (const itemName of tasks) {
                    if (this._itemMemCache[itemName]) continue;
                    const cached = await VN_Cache.get('item_cache', itemName);
                    if (cached && cached.url && !cached.url.startsWith('blob:')) {
                        const objUrl = await this._toObjectUrl(cached.url);
                        this._itemMemCache[itemName] = objUrl || cached.url;
                        continue;
                    }
                    if (cached && cached.url && cached.url.startsWith('blob:')) {
                        await VN_Cache.delete('item_cache', itemName);
                    }
                    if (!win.OS_IMAGE_MANAGER) continue; 
                    const raw = await VN_Image.getItem(itemName);
                    if (raw) {
                        try {
                            const fetchRes = await fetch(raw);
                            const blob = await fetchRes.blob();
                            const objUrl = URL.createObjectURL(blob);
                            const dataUrl = await new Promise(r => {
                                const reader = new FileReader();
                                reader.onload = () => r(reader.result);
                                reader.onerror = () => r('');
                                reader.readAsDataURL(blob);
                            });
                            this._itemMemCache[itemName] = objUrl;
                            if (dataUrl) await VN_Cache.set('item_cache', itemName, { prompt: itemName, url: dataUrl });
                        } catch(e) {
                            const url = await this._toDataUrl(raw);
                            if (url) {
                                this._itemMemCache[itemName] = url;
                                await VN_Cache.set('item_cache', itemName, { prompt: itemName, url });
                            }
                        }
                    }
                }
                console.log('[VN] 所有道具圖預熱完成');
            })();
        },

        _prewarmScenes: function() {
            const tasks = [];
            const seen = new Set();
            const _lines = this._linesOutsideDynBlocks();
            // 格式 A：[Scene|cacheId|prompt] 單行
            for (let i = 0; i < _lines.length; i++) {
                const line = _lines[i];
                if (line.startsWith('[Scene|')) {
                    const parts = line.slice(7, -1).split('|');
                    const cacheId = parts[0], prompt = parts[1];
                    if (!cacheId || !prompt || seen.has(cacheId)) continue;
                    seen.add(cacheId); tasks.push({ cacheId, prompt });
                }
                // 格式 B：<scene>...</scene> 多行 block
                if (line === '<scene>') {
                    const _pLines = [];
                    let j = i + 1;
                    while (j < _lines.length && _lines[j] !== '</scene>') {
                        const _l = _lines[j].trim();
                        if (_l && !_l.startsWith('//')) _pLines.push(_l);
                        j++;
                    }
                    const prompt  = _pLines.join('\n').trim();
                    const cacheId = 'sc_' + Math.abs(prompt.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
                    if (prompt && !seen.has(cacheId)) { seen.add(cacheId); tasks.push({ cacheId, prompt }); }
                }
            }
            if (!tasks.length) return;
            console.log(`[VN] 預熱場景CG：共 ${tasks.length} 張，依序排隊生成（NAI 不支援並發）...`);
            (async () => {
                for (const { cacheId, prompt } of tasks) {
                    if (this._sceneMemCache[cacheId]) continue;
                    const cached = await VN_Cache.get('scene_cache', cacheId);
                    if (cached && cached.url && !cached.url.startsWith('blob:')) {
                        const objUrl = await this._toObjectUrl(cached.url);
                        this._sceneMemCache[cacheId] = objUrl || cached.url;
                        this._preloadImg('scene_' + cacheId, this._sceneMemCache[cacheId]);
                        continue;
                    }
                    if (cached?.url?.startsWith('blob:')) await VN_Cache.delete('scene_cache', cacheId);
                    if (!win.OS_IMAGE_MANAGER) continue;
                    const raw = await VN_Image.getScene(prompt);
                    if (raw) {
                        try {
                            const fetchRes = await fetch(raw);
                            const blob = await fetchRes.blob();
                            const objUrl = URL.createObjectURL(blob);
                            const dataUrl = await new Promise(r => {
                                const reader = new FileReader();
                                reader.onload = () => r(reader.result);
                                reader.onerror = () => r('');
                                reader.readAsDataURL(blob);
                            });
                            this._sceneMemCache[cacheId] = objUrl;
                            this._preloadImg('scene_' + cacheId, objUrl);
                            if (dataUrl) {
                                await VN_Cache.set('scene_cache', cacheId, { prompt, rawUrl: raw, url: dataUrl });
                                this._saveSceneToDisk(cacheId, dataUrl);
                            }
                        } catch(e) {
                            const url = await this._toDataUrl(raw);
                            if (url) {
                                this._sceneMemCache[cacheId] = url;
                                await VN_Cache.set('scene_cache', cacheId, { prompt, rawUrl: raw, url });
                                this._saveSceneToDisk(cacheId, url);
                            }
                        }
                    }
                }
                console.log('[VN] 所有場景CG預熱完成');
            })();
        },

        // 將 scene dataUrl 儲存到 ST user/images/[角色名]/scene_[id].png（gallery 可見）
        _saveSceneToDisk: async function(cacheId, dataUrl) {
            try {
                const p = window.parent || window;
                const ctx = p.SillyTavern?.getContext?.();
                if (!ctx) return;
                const charName = ctx.characters?.[ctx.characterId]?.name || '';
                if (!charName) return;
                const headers = ctx.getRequestHeaders ? ctx.getRequestHeaders() : { 'Content-Type': 'application/json' };
                const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
                const fmt    = (dataUrl.match(/^data:image\/(\w+);/) || ['','png'])[1];
                const res = await fetch('/api/images/upload', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ image: base64, format: fmt, ch_name: charName, filename: 'scene_' + cacheId })
                });
                if (res.ok) { const d = await res.json(); console.log('[VN] Scene → disk:', d.path); }
            } catch(e) { console.warn('[VN] Scene disk save failed:', e); }
        },

        _safeFetchScene: async function(cacheId, prompt) {
            if (this._sceneMemCache[cacheId]) return this._sceneMemCache[cacheId];
            const cached = await VN_Cache.get('scene_cache', cacheId);
            if (cached && cached.url) {
                if (cached.url.startsWith('blob:')) {
                    await VN_Cache.delete('scene_cache', cacheId);
                } else {
                    const objUrl = await this._toObjectUrl(cached.url);
                    this._sceneMemCache[cacheId] = objUrl || cached.url;
                    this._preloadImg('scene_' + cacheId, this._sceneMemCache[cacheId]);
                    return this._sceneMemCache[cacheId];
                }
            }
            const raw = await VN_Image.getScene(prompt);
            if (!raw) return '';
            try {
                const fetchRes = await fetch(raw);
                const blob = await fetchRes.blob();
                const objUrl = URL.createObjectURL(blob);
                const dataUrl = await new Promise(r => {
                    const reader = new FileReader();
                    reader.onload = () => r(reader.result);
                    reader.onerror = () => r('');
                    reader.readAsDataURL(blob);
                });
                this._sceneMemCache[cacheId] = objUrl;
                this._preloadImg('scene_' + cacheId, objUrl);
                if (dataUrl) {
                    await VN_Cache.set('scene_cache', cacheId, { prompt, rawUrl: raw, url: dataUrl });
                    this._saveSceneToDisk(cacheId, dataUrl); // fire-and-forget → user/images/[char]/scene_[id].png
                }
                return objUrl;
            } catch(e) {
                const url = await this._toDataUrl(raw);
                if (url) {
                    this._sceneMemCache[cacheId] = url;
                    await VN_Cache.set('scene_cache', cacheId, { prompt, rawUrl: raw, url });
                    this._saveSceneToDisk(cacheId, url); // fire-and-forget
                }
                return this._sceneMemCache[cacheId] || '';
            }
        },

        _prewarmAvatars: function() {
            if (VN_Config.data.spriteBase) return;
            const names = Object.keys(this.avatars);
            // 把 persona 名字也納入預熱
            try {
                const uName = win.OS_PERSONA?.getName?.() || win.OS_API?.getGlobalUserName?.();
                if (uName && !this.avatars[uName] && !names.includes(uName)) names.push(uName);
            } catch(e) {}
            if (!names.length) return;

            (async () => {
                if (!this._lorebookLoaded) {
                    await this._loadLorebookAvatars();
                    this._lorebookLoaded = true;
                }

                // 第一輪：IDB / 世界書快取（同步快，先全跑完）
                const needGen = [];
                for (const name of names) {
                    if (this._avatarMemCache[name]) continue;
                    const lbUrl = this._lorebookAvatarCache[name] || this._lorebookAvatarCache[this._nameVariants(name).find(v => this._lorebookAvatarCache[v])];
                    if (lbUrl) { this._avatarMemCache[name] = lbUrl; console.log(`[VN] 頭像使用世界書素材：${name}`); continue; }
                    const cached = await VN_Cache.get('avatar_cache', name);
                    if (cached && cached.url && !cached.url.startsWith('blob:')) {
                        const objUrl = await this._toObjectUrl(cached.url);
                        this._avatarMemCache[name] = objUrl || cached.url;
                        console.log(`[VN] 頭像從 IDB 載入：${name}`); continue;
                    }
                    if (cached?.url?.startsWith('blob:')) await VN_Cache.delete('avatar_cache', name);
                    // persona URL 橋接：若名字是主角且有頭像 URL，直接用；有 desc 則注入為生圖 prompt
                    const pf = this._getPersonaFallback(name);
                    if (pf?.url) { this._avatarMemCache[name] = pf.url; console.log(`[VN] 頭像使用 Persona URL：${name}`); continue; }
                    if (pf?.prompt && !this.avatars[name]) this.avatars[name] = pf.prompt;
                    if (win.OS_IMAGE_MANAGER) needGen.push(name);
                }

                if (!needGen.length) { console.log('[VN] 所有頭像預熱完成（全部快取命中）'); return; }

                // 第二輪：並行生成（NAI 多圖同時發請求，不再循序等待）
                console.log(`[VN] 並行生成 ${needGen.length} 個頭像...`);
                await Promise.all(needGen.map(async name => {
                    try {
                        const raw = await VN_Image.getAvatar(this._resolveAvatarPrompt(name), 'Neutral');
                        if (!raw) { console.warn(`[VN] 頭像生成失敗：${name}`); return; }
                        try {
                            const fetchRes = await fetch(raw);
                            const blob = await fetchRes.blob();
                            const objUrl = URL.createObjectURL(blob);
                            const dataUrl = await new Promise(r => {
                                const reader = new FileReader();
                                reader.onload = () => r(reader.result);
                                reader.onerror = () => r('');
                                reader.readAsDataURL(blob);
                            });
                            this._avatarMemCache[name] = objUrl;
                            if (dataUrl) await VN_Cache.set('avatar_cache', name, { prompt: this._resolveAvatarPrompt(name), url: dataUrl });
                        } catch(e) {
                            const url = await this._toDataUrl(raw);
                            if (url) { this._avatarMemCache[name] = url; await VN_Cache.set('avatar_cache', name, { prompt: this._resolveAvatarPrompt(name), url }); }
                        }
                        console.log(`[VN] 頭像預熱完成：${name}`);
                    } catch(e) { console.warn(`[VN] 頭像預熱例外：${name}`, e); }
                }));
                console.log('[VN] 所有頭像預熱完成');
            })();
        },

        handlePanelClick: function() { if (this.isSkip) this.toggleSkip(); this.next(); },

        playSFX: function(sfxId) {
            // 切換新音效前，確保先停止上一個音效避免重疊
            this.stopSFX();

            if (!sfxId || sfxId === 'NA' || sfxId.trim() === '') return;
            const sfxPath = VN_Config.data.sfx || '';
            let sfxVol = VN_Settings.data.sfxVolume !== undefined ? VN_Settings.data.sfxVolume : 50;
            const vol = parseInt(sfxVol) / 100;

            const audio = new Audio();
            audio.volume = vol;
            audio.src = sfxPath + sfxId + '.mp3';
            
            // 綁定到當前音效變數
            this._currentSfxAudio = audio;

            const playWithLimit = (audioObj) => {
                audioObj.play().then(() => {
                    // 播放成功後，啟動 5 秒計時器，時間到強制停止
                    this._sfxTimer = setTimeout(() => {
                        this.stopSFX();
                    }, 5000);
                }).catch(err => { console.log('[VN_Core] SFX 播放失敗:', err); });
            };

            audio.play().then(() => {
                this._sfxTimer = setTimeout(() => {
                    this.stopSFX();
                }, 5000);
            }).catch(e => {
                // 退回 .wav 播放
                const audioWav = new Audio();
                audioWav.volume = vol;
                audioWav.src = sfxPath + sfxId + '.wav';
                this._currentSfxAudio = audioWav;
                playWithLimit(audioWav);
            });
        },

        _extractTextAndSFX: function(parts) {
            let sfx = 'NA';
            if (parts.length > 1) {
                let lastPart = parts[parts.length - 1].trim();
                if (/^[a-zA-Z0-9_\-&]+$/.test(lastPart)) {
                    sfx = parts.pop().trim();
                }
            }
            return { text: parts.join('|'), sfx: sfx };
        },

        // Expression → GPT-SoVITS emotion 映射（支援自訂無限標籤）
        _mapExprToEmotion: function(expr) {
            if (!expr) return '';
            const e = expr.toLowerCase();
            
            // 1. 保留原本的基礎情緒轉換（為了向下相容舊腳本）
            if (/happy|smile|laugh|joy|excite|delight|cheer|fun|playful|pleased/.test(e)) return 'happy';
            if (/sad|cry|sorrow|grief|depressed|melancholy|tear|weep/.test(e))           return 'sad';
            if (/surpris|shock|amaze|astonish|startl/.test(e))                           return 'surprise';
            if (/angry|mad|furious|rage|irritat|annoy/.test(e))                          return 'angry';
            if (/scare|fear|terrif|fright|horror/.test(e))                               return 'scare';
            if (/disgust|hate|loath|repuls|contempt/.test(e))                            return 'hate';
            
            // 2. 🌟 終極解鎖：如果都不符合上述基礎情緒，就「原封不動」回傳腳本上的標籤！
            // 這樣你的 "Smirk"、"哭腔" 或任何自訂情緒，就會直接送給 TTS 引擎。
            return expr;
        },


        // 腳本解析時一次性將所有 [Char|] 對話塞進 VN_TTS 佇列預生成
        _prewarmSoVITS: function() {
            const VN_TTS = (window.parent || window).VN_TTS;
            if (!VN_TTS?.config?.enabled) return;

            const lines = [];
            for (const line of this.script) {
                if (!line.startsWith('[Char|')) continue;
                const parts = line.slice(6, -1).split('|');
                const charName = parts[0];
                const ex = this._extractTextAndSFX(parts.slice(2));
                const text = this._cleanTextForSoVITS(ex.text);
                
                // 🎭 拆解 Type 與 Expression
                let rawExp = parts[1] || '';
                let typeHint = '';
                if (rawExp.includes('_')) {
                    const _pts = rawExp.split('_');
                    typeHint = _pts[0].trim();
                    rawExp = _pts.slice(1).join('_').trim();
                }

                if (!text || (VN_TTS._resolveModel && !VN_TTS._resolveModel(charName, typeHint))) continue;
                lines.push({ charName, text, emotion: this._mapExprToEmotion(rawExp), typeHint });
            }
            if (lines.length) {
                VN_TTS.prewarm(lines);
                console.log(`[VN] VN_TTS 預生成：${lines.length} 條語音排入佇列`);
            }
        },

        // 送 GPT-SoVITS 前清理文字：去掉開頭與結尾標點，避免後端切句異常與靜音
        _cleanTextForSoVITS: function(text) {
            if (!text) return '';
            let cleaned = text.replace(/^[。，、…‥「」『』【】〔〕！？!?,\s]+/, '');
            // 🌟 結尾過濾：拿掉了 ！？!? 和 … ‥ ，讓語氣保留！
            cleaned = cleaned.replace(/[。，、「」『』【】〔〕,\s]+$/, '');
            cleaned = cleaned.replace(/[,，]/g, ' ');
            cleaned = cleaned.replace(/\s+/g, ' ');
            return cleaned.trim();
        },
        
        // GPT-SoVITS TTS 播放 — 透過 VN_TTS 引擎（快取命中即播，否則串流生成）
        _vnSoVITSPlay: function(charName, rawText, emotion, typeHint) {
            const VN_TTS = (window.parent || window).VN_TTS;
            if (!VN_TTS?.config?.enabled) return;
            const text = this._cleanTextForSoVITS(rawText);
            if (!text) return;
            VN_TTS.play(charName, text, emotion, typeHint);
        },

        // 系統語音播放（[Sys|系統名|訊息]）— 透過 VN_TTS 系統音對應（不同 AI/系統各自的聲音）
        _vnSysVoicePlay: function(sysName, rawText) {
            const VN_TTS = (window.parent || window).VN_TTS;
            if (!VN_TTS?.config?.enabled || typeof VN_TTS.playSystem !== 'function') return;
            const text = this._cleanTextForSoVITS(rawText);
            if (!text) return;
            VN_TTS.playSystem(sysName || '', text);
        },

        next: function () {
            this.clearTimers();
            if (this.skipTypewriter()) { this.checkAutoNext(); return; }

            this.hideOverlays();

            if (this.index >= this.script.length - 1) {
                document.getElementById('dialogue-text').innerHTML = "";
                document.getElementById('speaker-name').style.display = 'none';
                this.isSkip = false; this.updateControlUI();
                const panelWrapper = document.getElementById('text-panel-wrapper');
                if (panelWrapper) panelWrapper.style.display = 'none';
                this._stageClear();   // 章節結束 → 清空兩格立繪
                const endOverlay = document.getElementById('vn-end-overlay');
                if (endOverlay) {
                    endOverlay.classList.add('active');
                    const endBtn = document.getElementById('vn-end-btn-data');
                    if (endBtn) {
                        endBtn.onclick = () => {
                            if (win.OS_API?.isStandalone?.() ?? false) {
                                VN_StandaloneArchive.show();
                            } else if (win.AureliaHtmlExtractor && typeof win.AureliaHtmlExtractor.show === 'function') {
                                win.AureliaHtmlExtractor.show();
                            } else if (win.toggleHtmlExtractor) {
                                win.toggleHtmlExtractor();
                            } else {
                                console.warn('[VN_Core] 找不到 AureliaHtmlExtractor (狀態提取模組)');
                            }
                        };
                    }
                }
                return;
            }

            this.index++;
            const line = this.script[this.index];

            if (line.startsWith('<chat')) { if(win.VN_Phone) win.VN_Phone.initChat(this, line); return; }
            if (line.startsWith('</chat>')) { if(win.VN_Phone) win.VN_Phone.exitChat(this); return; }
            if (line.startsWith('<call')) { if(win.VN_Phone) win.VN_Phone.initCall(this, line); return; }
            if (line.startsWith('</call>')) { if(win.VN_Phone) win.VN_Phone.exitCall(this); return; }

            // ── <scene>...</scene> 場景插圖 block ───────────────────────
            if (line === '<scene>') {
                if (localStorage.getItem('vn_scene_enabled') === '0') {
                    // 跳過整個 block
                    let _si = this.index + 1;
                    while (_si < this.script.length && this.script[_si] !== '</scene>') _si++;
                    this.index = _si; this.next(); return;
                }
                // 收集 block 內所有行，去除 // 開頭的 AI 思維鏈注釋
                const _promptLines = [];
                let _si = this.index + 1;
                while (_si < this.script.length && this.script[_si] !== '</scene>') {
                    const _l = this.script[_si].trim();
                    if (_l && !_l.startsWith('//')) _promptLines.push(_l);
                    _si++;
                }
                this.index = _si; // 停在 </scene>
                const _scenePrompt = _promptLines.join('\n').trim();
                if (_scenePrompt) {
                    const _overlay = document.getElementById('scene-cg-overlay');
                    const _cgImg   = document.getElementById('scene-cg-img');
                    if (_overlay && _cgImg) {
                        _overlay.classList.add('active');
                        this.hideVNPanel();
                        // cacheId = prompt hash
                        const _cacheId = 'sc_' + Math.abs(_scenePrompt.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
                        const _memUrl  = this._sceneMemCache[_cacheId];
                        if (_memUrl) { _cgImg.src = _memUrl; }
                        else {
                            _cgImg.src = '';
                            (async () => {
                                const url = await this._safeFetchScene(_cacheId, _scenePrompt);
                                if (url && _cgImg) _cgImg.src = url;
                            })();
                        }
                    }
                }
                return; // 等用戶點擊繼續（scene-cg-overlay 的關閉按鈕呼叫 next()）
            }
            if (line === '</scene>') { this.next(); return; }

            // 🔥 【動態積木攔截 - 最優先，必須在 DOM block 過濾之前】
            if (window.VN_DynamicParser && window.VN_DynamicParser.processLine(line, this)) {
                return;
            }

            // --- 自訂區塊過濾 ---
            {
                const _sysXml = ['content','call','chat','status','summary','avatar','scene',
                    'p','div','span','br','hr','b','i','em','strong','a','img',
                    'ul','ol','li','table','tr','td','th','thead','tbody','tfoot',
                    'h1','h2','h3','h4','h5','h6','blockquote','pre','code','section','aside'];

                if (window.VN_DynamicParser && window.VN_DynamicParser.activeTemplates) {
                    window.VN_DynamicParser.activeTemplates.forEach(tpl => {
                        if (tpl.isBlock && tpl.tagId) _sysXml.push(tpl.tagId.toLowerCase());
                    });
                }

                // 格式A：<XXX>
                const _fOpenA = line.match(/^<([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff-]*)>$/);
                // 單行整顆 <XXX>…</XXX>（如 <live_popup>[EventText|…]</live_popup>）→ 直接彈窗，不需推進 index
                const _fSelfA = line.match(/^<([A-Za-z一-鿿][\w一-鿿-]*)>[\s\S]*<\/\1>$/);
                if (_fSelfA && !_sysXml.includes(_fSelfA[1].toLowerCase())) {
                    this._showDomBlock(_fSelfA[1]);
                    return;
                }

                // 全形框卡片：整行 【…】（如 【姓名：…|…】）→ 有對應「卡片型」正則才彈窗，否則照常當旁白顯示
                if (line.charAt(0) === '【' && line.charAt(line.length - 1) === '】') {
                    const _lentCard = this._grabRegexCardHtml(line);
                    if (_lentCard) { this._showDomBlock(null, line, _lentCard); return; }
                }

                if (_fOpenA && !_sysXml.includes(_fOpenA[1].toLowerCase())) {
                    let _ei = this.index + 1;
                    const _ct = `</${_fOpenA[1]}>`;
                    while (_ei < this.script.length && this.script[_ei] !== _ct) _ei++;
                    this.index = _ei;
                    this._showDomBlock(_fOpenA[1]);
                    return;
                }
                const _fCloseA = line.match(/^<\/([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff-]*)>$/);
                if (_fCloseA && !_sysXml.includes(_fCloseA[1].toLowerCase())) { this.next(); return; }

                // 格式B：[XXX]
                const _fOpenB = line.match(/^\[([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff-]*)\]$/);
                if (_fOpenB) {
                    let _ei = this.index + 1;
                    const _ct = `[/${_fOpenB[1]}]`;
                    while (_ei < this.script.length && this.script[_ei] !== _ct) _ei++;
                    this.index = _ei;
                    this._showDomBlock(_fOpenB[1]);
                    return;
                }
                if (/^\[\/[A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff-]*\]$/.test(line)) { this.next(); return; }
            }

            if (this.mode === 'chat') { if(win.VN_Phone) win.VN_Phone.handleChatLine(line, this); return; }
            if (this.mode === 'call') { if(win.VN_Phone) win.VN_Phone.handleCallLine(line, this); return; }

            // === VN 模式核心渲染 ===
            this.toggleUI('vn');

            if (line.startsWith('[BGM|')) {
                const rawName = line.split('|')[1].replace(']', '').trim();
                const name = rawName.replace(/\.[^.]+$/, '');
                const audio = document.getElementById('bgm-player');
                if (name === 'stop') {
                    if (audio) audio.pause();
                } else if (VN_Config.data.bgm && audio) {
                    const _self = this;
                    const tryPlay = (filename, fuzzyHint) => {
                        // iOS 要靠 Web Audio 調 BGM 音量就得開 CORS；crossOrigin 必須在設 src 前設好，
                        // 否則跨域音訊接進 Web Audio 會被當 tainted 而靜音。
                        if (win.VN_AudioGain && win.VN_AudioGain.isIOS() && !audio.dataset.noCors) {
                            audio.crossOrigin = 'anonymous';
                        }
                        audio.src = VN_Config.data.bgm + filename + '.mp3';
                        const onOk  = () => { _self._showBgmToast(fuzzyHint ? `${filename} ←≈ ${name}` : filename, true); cleanup(); };
                        const onErr = async () => {
                            cleanup();
                            // 保命：BGM 主機沒開 CORS 時 crossOrigin 會害載入失敗 → 清掉重試純播放（放棄音量控制但確保有聲音）
                            if (audio.crossOrigin === 'anonymous' && !audio.dataset.noCors) {
                                audio.dataset.noCors = '1';
                                audio.removeAttribute('crossorigin');
                                tryPlay(filename, fuzzyHint);
                                return;
                            }
                            // exact 失敗 → 嘗試 fuzzy match
                            if (!fuzzyHint && win.VN_BgmIndex) {
                                await win.VN_BgmIndex.load();
                                const match = win.VN_BgmIndex.findMatch(name);
                                if (match) {
                                    console.log(`[VN] BGM fuzzy match: "${name}" → "${match.name}" (score ${match.score.toFixed(2)})`);
                                    tryPlay(match.name, true);
                                    return;
                                }
                            }
                            // 找不到夠像的 → 靜音（避免配錯氛圍）
                            _self._showBgmToast(name, false);
                        };
                        const cleanup = () => { audio.removeEventListener('canplay', onOk); audio.removeEventListener('error', onErr); };
                        audio.addEventListener('canplay', onOk, { once: true });
                        audio.addEventListener('error',   onErr, { once: true });
                        audio.play().catch(() => {});
                    };
                    tryPlay(name, false);
                } else {
                    this._showBgmToast(name, false);
                }
                this.next(); return;
            }

            // 🎬 場景CG
            if (line.startsWith('[Scene|')) {
                if (localStorage.getItem('vn_scene_enabled') === '0') { this.next(); return; }
                const parts = line.slice(7, -1).split('|');
                const cacheId = parts[0];
                const prompt  = parts[1];
                const overlay = document.getElementById('scene-cg-overlay');
                const cgImg   = document.getElementById('scene-cg-img');
                if (overlay && cgImg) {
                    overlay.classList.add('active');
                    this.hideVNPanel();
                    const memUrl = this._sceneMemCache[cacheId];
                    if (memUrl) {
                        cgImg.src = memUrl;
                    } else if (cacheId && prompt) {
                        cgImg.src = '';
                        (async () => {
                            const url = await this._safeFetchScene(cacheId, prompt);
                            if (url && cgImg) cgImg.src = url;
                        })();
                    }
                }
                return;
            }

            if (line.startsWith('[Bg|')) {
                this._stageClear();   // 換背景＝換場景 → 清空兩格立繪
                const parts = line.slice(4, -1).split('|');
                const sceneLabel = parts.length >= 2 ? parts[1] : parts[0];
                const aiPrompt   = parts[2] || (parts.length === 1 ? parts[0] : null);
                const cacheId    = sceneLabel || ('bg_' + Date.now());

                if (sceneLabel) {
                    const sceneName = sceneLabel.replace(/_/g, ' ');
                    const rankPanel = document.getElementById('stream-rank-panel');
                    const usePanel  = rankPanel && !rankPanel.classList.contains('hidden');
                    if (usePanel) {
                        document.getElementById('stream-scene-label').innerText = sceneName;
                        document.getElementById('stream-scene-row').classList.remove('hidden');
                        document.getElementById('top-badge').style.display = 'none';
                    } else {
                        const badge = document.getElementById('top-badge');
                        if (badge) { badge.innerText = sceneName; badge.style.display = 'block'; }
                    }
                }
                if (aiPrompt) {
                    this._lastBgCacheId = cacheId;
                    const memUrl = this._bgMemCache[cacheId];
                    const _gameBg = document.getElementById('game-bg');
                    if (memUrl) {
                        this._setBgImage(_gameBg, memUrl);
                    } else {
                        (async () => {
                            const url = await this._safeFetchBg(cacheId, aiPrompt);
                            if (url) this._setBgImage(_gameBg, url);
                        })();
                    }
                }
                this.next(); return;
            }

            // 📺 直播資訊 Header
            if (line.startsWith('[Stream|')) {
                const p = line.slice(8, -1).split('|').map(s => s.trim());
                const hdr = document.getElementById('stream-header');
                if (hdr) {
                    document.getElementById('stream-title-text').innerText  = p[0] || '';
                    document.getElementById('stream-host-text').innerText   = p[1] || '';
                    document.getElementById('stream-viewers').innerText     = p[2] || '';
                    document.getElementById('stream-followers').innerText   = p[3] || '';
                    document.getElementById('stream-rank').innerText        = p[4] || '';
                    hdr.classList.remove('hidden');
                }
                this.next(); return;
            }

            // 🎖 粉絲榜
            if (line.startsWith('[StreamRank|')) {
                const p = line.slice(12, -1).split('|').map(s => s.trim());
                for (let i = 0; i < 3; i++) {
                    const n = i * 3;
                    document.getElementById(`sr-name-${i+1}`).innerText  = p[n]   || '';
                    document.getElementById(`sr-title-${i+1}`).innerText = p[n+1] || '';
                    document.getElementById(`sr-score-${i+1}`).innerText = p[n+2] || '';
                }
                document.getElementById('stream-rank-panel').classList.remove('hidden');
                const badge = document.getElementById('top-badge');
                if (badge && badge.style.display !== 'none' && badge.innerText) {
                    document.getElementById('stream-scene-label').innerText = badge.innerText;
                    document.getElementById('stream-scene-row').classList.remove('hidden');
                    badge.style.display = 'none';
                }
                this.next(); return;
            }

            // 💬 彈幕
            if (line.startsWith('[Danmu|')) {
                const parts = line.slice(7, -1).split('|');
                this.launchDanmu(parts[0] || '', parts[1] || '');
                this.next(); return;
            }

            // 🏆 成就解鎖
            //   新格式：[Achievement|emotion|名|描述]   (3 段, V1.2+)
            //   舊格式：[Achievement|名|描述]           (2 段, 向下相容)
            if (line.startsWith('[Achievement|')) {
                const parts = line.slice(13, -1).split('|');
                let emotion = null, name = '', desc = '';
                if (parts.length >= 3) {
                    // 新格式
                    emotion = (parts[0] || '').trim() || null;
                    name    = parts[1] || '';
                    desc    = parts[2] || '';
                } else {
                    // 舊格式
                    name = parts[0] || '';
                    desc = parts[1] || '';
                }
                this.addLog("成就解鎖", `${name}${desc ? ' — ' + desc : ''}`);
                document.getElementById('achievement-name').innerText = name;
                document.getElementById('achievement-desc').innerText = desc;
                document.getElementById('achievement-overlay').classList.add('active');
                if (win.OS_ACHIEVEMENT?.unlock) win.OS_ACHIEVEMENT.unlock(emotion, name, desc);
                clearTimeout(this._achTimer);
                this._achTimer = setTimeout(() => { this.dismissAchievement(); }, 3500);
                return;
            }

            // 📋 委託面板
            if (line.startsWith('[Quest|')) {
                const parts = line.slice(7, -1).split('|');
                const qtitle  = parts[0] || '';
                const qnpc    = parts[1] || '';
                const qdesc   = parts[2] || '';
                const qreward = parts[3] || '';
                document.getElementById('quest-title').innerText          = qtitle;
                document.getElementById('quest-requester-name').innerText = qnpc;
                document.getElementById('quest-desc').innerText           = qdesc;
                document.getElementById('quest-reward').innerText         = qreward;
                document.getElementById('quest-overlay').classList.add('active');
                this.hideVNPanel();
                this.addLog("委託", `【${qtitle}】${qnpc ? ' — ' + qnpc : ''}${qreward ? ' 獎勵：' + qreward : ''}`);
                return;
            }

            if (line.startsWith('[Sys|')) {
                const parts = line.slice(5, -1).split('|');
                const bodyText = parts.length >= 2 ? parts.slice(1).join('|') : parts[0];
                if (bodyText.includes('成就解鎖') || bodyText.includes('成就：') || bodyText.includes('Achievement')) {
                    this.next(); return;
                }
                const titleEl = document.getElementById('sys-title');
                const textEl  = document.getElementById('sys-text');
                if (parts.length >= 2) { titleEl.innerText = parts[0]; titleEl.style.display = 'block'; }
                else { titleEl.style.display = 'none'; }
                document.getElementById('sys-overlay').classList.add('active');
                this.hideVNPanel();
                this.typewriter(textEl, this.parseMarkdown(bodyText));
                this.addLog("系統", bodyText);
                // 🖥️ 系統語音：依系統名（parts[0]）抽對應的音；無系統名 → 預設系統音
                this._vnSysVoicePlay(parts.length >= 2 ? parts[0] : '', bodyText);
                return;
            }

            if (line.startsWith('[Trans|')) {
                this._stageClear();   // 過場 → 清空兩格立繪
                const _tParts = line.split('|');
                const text = (_tParts[2]?.replace(']', '') || _tParts[1]?.replace(']', '') || '').trim();
                document.getElementById('trans-text').innerText = text;
                document.getElementById('trans-overlay').classList.add('active');
                this.hideVNPanel(); setTimeout(() => this.checkAutoNext(), 2000); return;
            }

            if (line.startsWith('[Item|')) {
                const parts = line.slice(6, -1).split('|');
                const itemName = parts[0];
                document.getElementById('item-title').innerText = itemName;
                document.getElementById('item-desc').innerText  = parts[1] || '';
                document.getElementById('item-overlay').classList.add('active');
                this.hideVNPanel();
                document.getElementById('item-img').src = '';
                const memUrl = this._itemMemCache[itemName];
                if (memUrl) {
                    document.getElementById('item-img').src = memUrl;
                } else {
                    (async () => {
                        const cached = await VN_Cache.get('item_cache', itemName);
                        if (cached && cached.url && !cached.url.startsWith('blob:')) {
                            const objUrl = await this._toObjectUrl(cached.url);
                            this._itemMemCache[itemName] = objUrl || cached.url;
                        } else {
                            const raw = await VN_Image.getItem(itemName);
                            if (raw) {
                                try {
                                    const fetchRes = await fetch(raw);
                                    const blob = await fetchRes.blob();
                                    const objUrl = URL.createObjectURL(blob);
                                    const dataUrl = await new Promise(r => {
                                        const reader = new FileReader();
                                        reader.onload = () => r(reader.result);
                                        reader.onerror = () => r('');
                                        reader.readAsDataURL(blob);
                                    });
                                    this._itemMemCache[itemName] = objUrl;
                                    if (dataUrl) await VN_Cache.set('item_cache', itemName, { prompt: itemName, url: dataUrl });
                                } catch(e) {
                                    this._itemMemCache[itemName] = raw;
                                    await VN_Cache.set('item_cache', itemName, { prompt: itemName, url: raw });
                                }
                            }
                        }
                        if (this._itemMemCache[itemName]) document.getElementById('item-img').src = this._itemMemCache[itemName];
                    })();
                }
                this.addLog("獲得物品", `${itemName} - ${parts[1]||''}`);
                return;
            }

            // 🎭 這是你最關心的核心：拆解 Type 和 Expression，然後呼叫對應系統
            if (line.startsWith('[Char|')) {
                const p = line.slice(6, -1).split('|');
                const ex = this._extractTextAndSFX(p.slice(2));
                
                // 拆解 Type 與 Expression
                let rawExp = p[1] || '';
                let typeHint = '';
                if (rawExp.includes('_')) {
                    const _pts = rawExp.split('_');
                    typeHint = _pts[0].trim();
                    rawExp = _pts.slice(1).join('_').trim();
                }

                this.updateSprite(p[0], rawExp);
                this.renderVN(p[0], ex.text);
                this.addLog(p[0], ex.text);
                this.playSFX(ex.sfx);
                this._lastChar = p[0];
                this._currentChar = { charName: p[0], text: ex.text, emotion: this._mapExprToEmotion(rawExp), expression: rawExp };
                this.updateControlUI();
                
                // 把 typeHint 傳給 TTS
                this._vnSoVITSPlay(p[0], ex.text, this._mapExprToEmotion(rawExp), typeHint);
                
                (function(charName, text, expression) {
                    const _mm = (window.parent || window).OS_MINIMAX;
                    if (_mm) _mm.playForChar(charName, text, { expression });
                })(p[0], ex.text, rawExp);
                
                (function prefetchNext(script, curIdx) {
                    const _mm = (window.parent || window).OS_MINIMAX;
                    if (!_mm?.prefetchForChar) return;
                    for (let i = curIdx + 1; i < script.length; i++) {
                        const nl = script[i];
                        if (nl.startsWith('[Char|')) {
                            const np = nl.slice(6, -1).split('|');
                            const nex = VN_Core._extractTextAndSFX(np.slice(2));
                            
                            let nRawExp = np[1] || '';
                            if (nRawExp.includes('_')) {
                                const nPts = nRawExp.split('_');
                                nRawExp = nPts.slice(1).join('_').trim();
                            }
                            
                            if (nex.text) _mm.prefetchForChar(np[0], nex.text, { expression: nRawExp });
                            break;
                        }
                        if (nl.startsWith('[Choice|') || nl.startsWith('[End]') || nl.startsWith('</')) break;
                    }
                })(this.script, this.index);
                return;
            }

            if (line.startsWith('[Inner|')) {
                const p = line.slice(7, -1).split('|');
                const ex = this._extractTextAndSFX(p.slice(1));
                const _innerClean = ex.text.replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
                this.updateSprite(p[0], 'Think');
                this.renderVN(p[0], _innerClean, 'inner');
                this.addLog(p[0], _innerClean);
                this.playSFX(ex.sfx);
                return;
            }
            if (line.startsWith('[Exit|')) {
                const p = line.slice(6, -1).split('|');
                if (p[0]) this._stageRemove(p[0].trim());   // 角色離場 → 移除該格立繪
                this.next();
                return;
            }
            if (line.startsWith('[Nar|')) {
                this._stageNarr();   // 旁白：算一場次(推進清滯留) + 立繪全留全部變暗
                const p = line.slice(5, -1).split('|');
                const ex = this._extractTextAndSFX(p);
                this._currentChar = null; this.updateControlUI();
                this.renderVN('', ex.text);
                this.addLog("旁白", ex.text);
                this.playSFX(ex.sfx);
                return;
            }

            // 🎮 選擇按鈕
            if (line.startsWith('[Choice|')) {
                if (win.OS_API?.isStandalone?.() ?? false) {
                    this._showStandaloneChoices(line);
                } else {
                    this.next();
                }
                return;
            }

            // 📖 章節結束標記
            if (line.startsWith('[SessionEnd|')) {
                if (win.OS_API?.isStandalone?.() ?? false) {
                    try {
                        const tagSummary = line.slice(12, -1);
                        const fullText = this._lastRawText || '';
                        win.dispatchEvent(new CustomEvent('os_vn_session_end', {
                            detail: { summary: tagSummary, fullText }
                        }));
                        console.log('[VN_Core] 已派發 os_vn_session_end 事件');
                    } catch(e) {}
                }
                this.next();
                return;
            }

            // Fallback
            const _trimmed = line.trim();
            if (/^\*{1,2}[^*].+\*{1,2}$/.test(_trimmed)) {
                const _innerText = _trimmed.replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
                this.renderVN('', _innerText, 'inner');
                this.addLog('内心', _innerText);
                return;
            }
            const _stripped = _trimmed.replace(/^\[?/, '').replace(/\]$/, '').trim();
            if (_stripped.length > 2 && !_trimmed.startsWith('[') && !_trimmed.startsWith('<') && !_trimmed.startsWith('//') && !_trimmed.startsWith('---')) {
                this._stageNarr();   // 純文字旁白：算一場次(推進清滯留) + 立繪保留變暗
                this.renderVN('', _stripped);
                this.addLog('旁白', _stripped);
                return;
            }
            this.next();
        },

        /* --- UI 切換與渲染 --- */
        hideOverlays: function() {
            ['sys-overlay', 'trans-overlay', 'item-overlay', 'achievement-overlay', 'quest-overlay', 'scene-cg-overlay'].forEach(id => document.getElementById(id).classList.remove('active'));
            document.getElementById('text-panel-wrapper').style.display = 'block';
        },
        dismissAchievement: function() {
            clearTimeout(this._achTimer);
            document.getElementById('achievement-overlay').classList.remove('active');
        },
        _showBgmToast: function(name, found) {
            const toast = document.getElementById('vn-bgm-toast');
            if (!toast) return;
            document.getElementById('vn-bgm-name').textContent = name;
            document.getElementById('vn-bgm-label').textContent = found ? 'NOW PLAYING' : 'BGM NOT FOUND';
            document.getElementById('vn-bgm-icon').textContent  = found ? '🎵' : '🔇';
            toast.classList.remove('found', 'notfound', 'active');
            void toast.offsetWidth; // reflow
            toast.classList.add(found ? 'found' : 'notfound', 'active');
            clearTimeout(this._bgmToastTimer);
            this._bgmToastTimer = setTimeout(() => toast.classList.remove('active'), 3000);
        },
        _danmuLaneTs: [0,0,0,0,0,0,0], // 每條跑道上次被分配的時間戳
        launchDanmu: function(name, text) {
            const container = document.getElementById('danmu-container');
            if (!container) return;

            // 選出最久沒被用的跑道 (LRU)，保證不重複到同一條
            const ts = this._danmuLaneTs;
            let lane = 0;
            for (let i = 1; i < ts.length; i++) {
                if (ts[i] < ts[lane]) lane = i;
            }
            ts[lane] = Date.now();

            const item = document.createElement('div');
            item.className = 'danmu-item';
            const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            item.innerHTML = `<span class="danmu-name">${esc(name)}</span><span class="danmu-sep"> · </span><span class="danmu-text">${esc(text)}</span>`;
            item.style.top = (lane * 13 + 2) + '%';
            const baseDur = this._danmuSpeed || 18;
            item.style.animationDuration = (baseDur + Math.random() * 3).toFixed(1) + 's';
            container.appendChild(item);
            item.addEventListener('animationend', () => item.remove());
        },
        hideVNPanel: function() {
            document.getElementById('text-panel-wrapper').style.display = 'none';
            const g1 = document.getElementById('game-char'); if (g1) g1.style.display = 'none';
            const g2 = document.getElementById('game-char-2'); if (g2) g2.style.display = 'none';
            const cp = document.getElementById('char-portrait'); if (cp) cp.style.display = 'none';
        },
        toggleUI: function(target) {
            const po = document.getElementById('phone-overlay');
            if (target === 'vn') { po.classList.remove('active'); document.getElementById('text-panel-wrapper').style.display = 'block'; }
            else {
                po.classList.add('active'); document.getElementById('text-panel-wrapper').style.display = 'none';
                document.getElementById('phone-chat').classList.toggle('hidden', target !== 'phone-chat');
                document.getElementById('phone-call').classList.toggle('hidden', target !== 'phone-call');
            }
        },

        /* --- UI 按鈕代理函式 --- */
        answerCall: function() { if (win.VN_Phone) win.VN_Phone.answerCall(this); },
        rejectCall: function() { if (win.VN_Phone) win.VN_Phone.rejectCall(this); },
        closeChat:  function() { if (win.VN_Phone) win.VN_Phone.closeChat(this); },
        hangUpCall: function() { if (win.VN_Phone) win.VN_Phone.hangUpCall(this); },

        /* --- Skip / Log --- */
        checkAutoNext: function() { if (this.isSkip) this._autoTimer = setTimeout(() => this.next(), this.skipDelay); },
        toggleCtx: function() {
            const popup = document.getElementById('vn-ctx-popup');
            const btn   = document.getElementById('vn-btn-ctx');
            if (!popup) return;
            const isOpen = popup.classList.toggle('show');
            if (btn) btn.classList.toggle('active', isOpen);
            if (isOpen) VN_CtxMonitor.poll();
        },
        _saveCtxLimit: function(val) {
            VN_CtxMonitor.saveLimit(val);
        },
        toggleSkip: function() {
            this.clearTimers();
            this.isSkip = false;
            this._twSpeed = VN_Settings.data.twSpeed || 30;
            this.updateControlUI();

            let scanMode = this.mode;
            for (let i = this.index + 1; i < this.script.length; i++) {
                const line = this.script[i];
                if (line.startsWith('<chat'))       { scanMode = 'chat'; continue; }
                if (line.startsWith('</chat>'))     { scanMode = 'vn';   continue; }
                if (line.startsWith('<call'))       { scanMode = 'call'; continue; }
                if (line.startsWith('</call>'))     { scanMode = 'vn';   continue; }

                if (scanMode === 'chat' || scanMode === 'call') {
                    if (win.VN_Phone) win.VN_Phone.scanLog(line, scanMode, this);
                } else {
                    if (line.startsWith('[Char|'))  { const p = line.slice(6,-1).split('|'); const ex=this._extractTextAndSFX(p.slice(2)); this.addLog(p[0], ex.text); }
                    else if (line.startsWith('[Inner|')) { const p = line.slice(7,-1).split('|'); const ex=this._extractTextAndSFX(p.slice(1)); this.addLog(p[0], `*${ex.text}*`); }
                    else if (line.startsWith('[Nar|'))  { const p = line.slice(5,-1).split('|'); const ex=this._extractTextAndSFX(p); this.addLog("旁白", ex.text); }
                    else if (line.startsWith('[Sys|'))  { const p = line.slice(5,-1).split('|'); this.addLog("系統", p.length >= 2 ? p.slice(1).join('|') : p[0]); }
                    else if (line.startsWith('[Item|')) { const p = line.slice(6,-1).split('|'); this.addLog("獲得物品", `${p[0]} - ${p[1]||''}`); }
                }
            }

            this.mode = 'vn';
            this.toggleUI('vn');
            document.getElementById('dialogue-text').innerHTML = '';
            document.getElementById('speaker-name').style.display = 'none';

            // 檢查末尾是否為選擇（支援新格式：連續多行 [Choice|...]）
            // 找到最後一段連續 Choice 行的起始位置
            let _firstChoiceIdx = this.script.length - 1;
            while (_firstChoiceIdx > 0 && this.script[_firstChoiceIdx].startsWith('[Choice|')) {
                _firstChoiceIdx--;
            }
            // 修正：如果退到非 Choice 行，往前一步
            if (!this.script[_firstChoiceIdx]?.startsWith('[Choice|')) _firstChoiceIdx++;

            const _firstChoiceLine = this.script[_firstChoiceIdx];
            if (_firstChoiceLine?.startsWith('[Choice|') && (win.OS_API?.isStandalone?.() ?? false)) {
                this.index = _firstChoiceIdx;
                this._showStandaloneChoices(_firstChoiceLine);
            } else {
                this.index = this.script.length - 1;
                this.next();   // 直接觸發「到末尾」顯示資訊中心，不要留一個空對話框等用戶再點一下
            }
        },
        updateControlUI: function() {
            const btnSkip = document.getElementById('vn-btn-skip');
            if (btnSkip) btnSkip.classList.toggle('active', this.isSkip);

            const btnRegen = document.getElementById('vn-btn-regen');
            if (!btnRegen) return;

            const isStandalone = win.OS_API?.isStandalone?.() ?? false;
            if (isStandalone) {
                // 獨立模式：MiniMax 啟用時才顯示，title 改為重播
                const mmEnabled = win.OS_MINIMAX?.getConfig().enabled ?? false;
                btnRegen.style.display = (this._currentChar && mmEnabled) ? 'inline-block' : 'none';
                btnRegen.title = '重播當前語音（MiniMax TTS）';
            } else {
                // ST 模式：有角色行就顯示，title 保持原意
                btnRegen.style.display = this._currentChar ? 'inline-block' : 'none';
                btnRegen.title = '清除快取並重新生成當前語音（VN_TTS）';
            }
        },

        // 重新生成/重播當前 [Char|] 行的 TTS
        // 獨立模式 → MiniMax 重播；ST 模式 → GPT-SoVITS 重新生成（原邏輯不動）
        regenCurrentTTS: async function() {
            const { charName, text, emotion, expression } = this._currentChar || {};
            if (!charName || !text) return;

            const btn = document.getElementById('vn-btn-regen');
            const isStandalone = win.OS_API?.isStandalone?.() ?? false;

            // ── 獨立模式：優先從 Blob 快取重播（免費），快取失效才呼叫 API ──
            if (isStandalone) {
                const _mm = win.OS_MINIMAX;
                if (!_mm || !_mm.getConfig().enabled) {
                    console.warn('[VN] MiniMax TTS 未啟用或未載入');
                    return;
                }
                if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
                const hit = await _mm.replayLast(charName, text, { expression });
                if (!hit) await _mm.playForChar(charName, text, { expression });
                if (btn) { btn.textContent = '↺ TTS'; btn.disabled = false; }
                return;
            }

            // ── ST 模式：透過 VN_TTS 重新生成 ──
            const VN_TTS = (window.parent || window).VN_TTS;
            if (!VN_TTS?.config?.enabled) { console.warn('[VN] VN_TTS 不可用或未啟用'); return; }

            if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
            VN_TTS.clearCache(charName, text);
            VN_TTS.play(charName, text, emotion);
            if (btn) { btn.textContent = '↺ TTS'; btn.disabled = false; }
        },
        addLog: function(name, text) { this.logHistory.push({ name, text: text.replace(/\*/g, '') }); },
        showLog: function() { const content = document.getElementById('vn-log-content'); content.innerHTML = this.logHistory.map(log => `<div class="vn-log-item"><div class="vn-log-name">${log.name}</div><div class="vn-log-text">${log.text}</div></div>`).join(''); document.getElementById('vn-log-overlay').classList.add('active'); setTimeout(() => { content.scrollTop = content.scrollHeight; }, 50); },
        hideLog: function() { document.getElementById('vn-log-overlay').classList.remove('active'); },

        typewriter: function(el, html, speed) {
            if (this._twTimer) { clearTimeout(this._twTimer); this._twTimer = null; }
            this._twEl = el; this._twFull = html;
            const tokens = []; const re = /<[^>]+>|[\s\S]/g; let m;
            while ((m = re.exec(html)) !== null) tokens.push(m[0]);
            let idx = 0, current = ''; el.innerHTML = '';
            const step = () => {
                if (idx >= tokens.length) { this._twTimer = null; this.checkAutoNext(); return; }
                let added = 0;
                while (idx < tokens.length) {
                    const t = tokens[idx++]; current += t;
                    if (!t.startsWith('<')) { added++; if (added >= 1) break; }
                }
                el.innerHTML = current;
                this._twTimer = setTimeout(step, speed !== undefined ? speed : (this.isSkip ? 5 : this._twSpeed));
            };
            this._twTimer = setTimeout(step, speed !== undefined ? speed : (this.isSkip ? 5 : this._twSpeed));
        },
        skipTypewriter: function() {
            if (this._twTimer) {
                clearTimeout(this._twTimer); this._twTimer = null;
                if (this._twEl) this._twEl.innerHTML = this._twFull;
                return true;
            }
            return false;
        },
        parseMarkdown: function(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'<em>$1</em>'); },
        renderVN: function(n, t, mode) {
            const nel = document.getElementById('speaker-name');
            const panel = document.getElementById('text-panel');
            const dtEl = document.getElementById('dialogue-text');
            panel.classList.remove('inner-mode');
            if (mode === 'inner') {
                if (n) { nel.style.display = 'inline-block'; nel.innerText = n; }
                else { nel.style.display = 'none'; }
                panel.classList.remove('nar-mode'); panel.classList.add('char-mode', 'inner-mode');
            } else if (n) {
                nel.style.display = 'inline-block'; nel.innerText = n;
                panel.classList.remove('nar-mode'); panel.classList.add('char-mode');
            } else {
                nel.style.display = 'none';
                panel.classList.remove('char-mode'); panel.classList.add('nar-mode');
            }
            panel.classList.remove('anim'); void panel.offsetWidth; panel.classList.add('anim');
            this.typewriter(dtEl, this.parseMarkdown(t));
        },

        _nameVariants: function(name) {
            return [
                name,
                name.replace(/[·・•·]/g, '_'),
                name.replace(/[·・•·\s]/g, ''),
                name.split(/[·・•·]/)[0].trim(),
            ].filter((v, i, arr) => v && arr.indexOf(v) === i);
        },

        // 模糊查找頭像提示詞：先精確，再 variants，再雙向前綴/包含匹配
        // 解決 AI profile 用全名（卡蜜拉·洛爾德）但 VN tag 用短名（卡蜜拉）的對齊問題
        // 取 OS_PERSONA 的頭像資料：先 URL，再 desc（作為生圖 prompt）
        // 只在 name 與當前 persona 名稱吻合時才返回資料
        _getPersonaFallback: function(name) {
            try {
                const userName = win.OS_PERSONA?.getName?.() || win.OS_API?.getGlobalUserName?.();
                if (!userName || name !== userName) return null;
                const p = win.OS_PERSONA?.getCurrent?.() || {};
                return { url: p.avatar || '', prompt: p.desc || '' };
            } catch(e) { return null; }
        },

        _resolveAvatarPrompt: function(name) {
            if (!name) return '';
            const avatars = this.avatars;
            // 1. 精確
            if (avatars[name]) return avatars[name];
            // 2. _nameVariants 變形
            for (const v of this._nameVariants(name)) {
                if (avatars[v]) return avatars[v];
            }
            // 3. 雙向前綴模糊：name 是 key 的前綴，或 key 是 name 的前綴（長名 ↔ 短名）
            const keys = Object.keys(avatars);
            for (const k of keys) {
                if (k.startsWith(name) || name.startsWith(k)) return avatars[k];
            }
            // 4. 包含匹配（最後手段）
            for (const k of keys) {
                if (k.includes(name) || name.includes(k)) return avatars[k];
            }
            return '';
        },

        // 立刻隱藏（無 transition，不留殘影）
        _hideEl: function(el) {
            if (!el) return;
            el.classList && el.classList.remove('no-frame');
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.display = 'none';
        },
        // 淡入顯示（fade-in，避免閃爍）
        _showEl: function(el, src) {
            if (!el) return;
            const sameSrc = (src === undefined) || (el.getAttribute('src') === src);
            const visible = el.style.display !== 'none' && el.style.display !== '' && el.style.opacity !== '0';
            if (src !== undefined) el.src = src;
            // 已經在顯示同一張圖 → 只確保亮著，不重跑淡入（避免同角色連說 / 旁白後再開口時閃爍）
            if (sameSrc && visible) { el.style.display = 'block'; el.style.opacity = '1'; return; }
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.display = 'block';
            requestAnimationFrame(() => {
                el.style.transition = 'opacity 0.18s ease';
                el.style.opacity = '1';
            });
        },

        // 換圖：先把新圖預載好，再「設版型 class + 換 src + 淡入」一起做 →
        // 避免同一格從頭像換成立繪時，舊圖殘留在新版型位置一兩幀
        _swapImage: function(img, url, isAvatar, isStale, onShown) {
            if (!img || !url) return;
            const apply = () => {
                if (isStale && isStale()) return;
                img.classList.toggle('vn-avatar', !!isAvatar);
                this._showEl(img, url);
                if (onShown) onShown();
            };
            const visible = img.style.display !== 'none' && img.style.display !== '' && img.style.opacity !== '0';
            if (img.getAttribute('src') === url && visible) { apply(); return; }   // 已是同圖且顯示中 → 直接套用
            const tmp = new Image();
            tmp.onload = apply;
            tmp.onerror = apply;
            tmp.src = url;
        },

        // ===== 雙格立繪舞台 =====
        // _stage[0]=左格、_stage[1]=右格；各為 null 或 { name, exp, lastTick }
        _slotEl: function(idx) { return document.getElementById(idx === 0 ? 'game-char' : 'game-char-2'); },
        _stageInit: function() { if (!this._stage) { this._stage = [null, null]; this._stageTick = 0; } },
        _stageIndexFor: function(name) {
            this._stageInit();
            for (let i = 0; i < 2; i++) if (this._stage[i] && this._stage[i].name === name) return i;   // 已在場 → 沿用原格
            for (let i = 0; i < 2; i++) if (!this._stage[i]) return i;                                   // 有空格 → 先左後右
            return (this._stage[0].lastTick <= this._stage[1].lastTick) ? 0 : 1;                         // 兩格滿 → 驅逐最久沒說話那格
        },
        // 燈光：speakerIdx 那格亮、其餘在場變暗；speakerIdx=-1（旁白）全暗
        _applyStageLighting: function(speakerIdx) {
            this._stageInit();
            const occ = [0, 1].filter(i => this._stage[i]);
            const solo = (occ.length === 1) ? occ[0] : -1;   // 只有一個角色在場 → 置中
            for (let i = 0; i < 2; i++) {
                const el = this._slotEl(i);
                if (!el || !this._stage[i]) continue;
                el.classList.toggle('vn-dim', i !== speakerIdx);
                el.classList.toggle('vn-active', i === speakerIdx);
                el.classList.toggle('vn-solo', i === solo);
            }
        },
        _stageDimAll: function() { this._applyStageLighting(-1); },
        // 旁白也算一個「場次」：推進 tick + 清滯留(連續在場 N 次沒說話就移除) + 全部變暗
        _stageNarr: function() { this._stageInit(); this._stageTick++; this._staleSweep(); this._applyStageLighting(-1); },
        _clearSlot: function(i) {
            this._stageInit();
            this._stage[i] = null;
            const el = this._slotEl(i);
            if (el) { this._hideEl(el); el.classList.remove('vn-dim', 'vn-active', 'vn-solo', 'vn-avatar'); }
        },
        _stageRemove: function(name) {
            this._stageInit();
            for (let i = 0; i < 2; i++) if (this._stage[i] && this._stage[i].name === name) this._clearSlot(i);
        },
        _stageClear: function() { this._stageInit(); this._clearSlot(0); this._clearSlot(1); },
        // 滯留清除：某格角色超過 N tick 沒當說話者 → 自動移除（防殘留），N 預設 5、可由 localStorage 覆寫
        _staleSweep: function() {
            this._stageInit();
            let limit = parseInt(window.localStorage.getItem('vn_sprite_stale_limit'));
            if (isNaN(limit) || limit < 1) limit = 5;
            for (let i = 0; i < 2; i++) {
                const s = this._stage[i];
                if (s && (this._stageTick - s.lastTick) >= limit) this._clearSlot(i);
            }
        },

        // isStale：給雙格用的「這格還是不是同一角色」守衛；不給就退回舊的 currentName 守衛（通話模式用）
        _tryLoad: function(targetImg, urls, fallback, onSuccess, isStale) {
            const guardName0 = this.currentName;
            const _stale = isStale || (() => this.currentName !== guardName0);
            let i = 0;
            const tryNext = () => {
                if (i >= urls.length) { fallback(); return; }
                const url = urls[i++];
                const tempImg = new Image();
                tempImg.onload = () => {
                    if (_stale()) return;
                    if (targetImg.id !== 'call-avatar') this._showEl(targetImg, url); else targetImg.src = url;
                    if (onSuccess) onSuccess(targetImg);
                };
                tempImg.onerror = () => { if (_stale()) return; tryNext(); };
                tempImg.src = url;
            };
            tryNext();
        },

        // 公開入口（[Char]/[Inner] 呼叫）：把說話角色放上舞台、渲染、打燈、清滯留
        updateSprite: function(name, exp) {
            this._stageInit();
            this._stageTick++;
            const idx = this._stageIndexFor(name);
            const prev = this._stage[idx];
            const isNew = !prev || prev.name !== name;
            this._stage[idx] = { name, exp, lastTick: this._stageTick };
            this.currentName = name; this.currentExp = exp;   // 相容：通話/TTS/部分舊流程仍讀
            const el = this._slotEl(idx);
            // 換角色：先清掉舊角色的版型 class(浮起金框/置中/明暗) 並隱藏，避免「舊圖用舊版型閃一下」才換新圖
            if (el && isNew) { el.classList.remove('vn-avatar', 'vn-solo', 'vn-dim', 'vn-active'); this._hideEl(el); el.dataset.slideIn = '1'; }
            this._renderSlot(idx, name, exp);
            this._applyStageLighting(idx);     // 說話者亮、另一格（若在場）變暗
            this._staleSweep();
        },

        // 單格圖片解析鏈（sprite_cache → spriteBase → fallbackToAI），守衛改用「這格還是不是同角色」
        _renderSlot: async function(idx, name, exp) {
            const img = this._slotEl(idx);
            if (!img) return;
            const _stale = () => !this._stage[idx] || this._stage[idx].name !== name;
            const triggerAnim = (target) => {
                if (_stale()) return;
                target.classList.remove('vn-avatar');   // 真立繪 → 貼地（移除頭像浮起樣式）
                target.classList.remove('sprite-shake', 'sprite-jumpscare', 'sprite-slide-in-right');
                void target.offsetWidth;
                if (target.dataset.slideIn === '1') { target.classList.add('sprite-slide-in-right'); delete target.dataset.slideIn; }
                else { if (exp === 'Surprised') target.classList.add('sprite-shake'); if (exp === 'JumpScare') target.classList.add('sprite-jumpscare'); }
            };
            // 最優先：sprite_cache（透明真立繪）
            for (const v of this._nameVariants(name)) {
                const cached = await VN_Cache.get('sprite_cache', v);
                if (cached?.url) { if (_stale()) return; this._swapImage(img, cached.url, false, _stale, () => triggerAnim(img)); return; }
            }
            if (VN_Config.data.spriteBase) {
                const urls = this._nameVariants(name).map(v => `${VN_Config.data.spriteBase}${v}_${exp}.png`);
                this._tryLoad(img, urls, () => this.handleImgError(img), triggerAnim, _stale);
            } else this.fallbackToAI(idx, name, exp);
        },
        
        updateCallAvatar: function(name) {
            this.currentName = name; this.currentExp = 'Neutral';
            const img = document.getElementById('call-avatar');
            if (VN_Config.data.spriteBase) {
                const urls = this._nameVariants(name).map(v => `${VN_Config.data.spriteBase}${v}_Neutral.png`);
                this._tryLoad(img, urls, () => this.handleImgError(img), null);
            } else this.fallbackToAI('call', name, 'Neutral');
        },

        handleImgError: function(img) {
            img.onerror = null;
            const isCall = img.id === 'call-avatar';
            const target = isCall ? 'call' : (img.id === 'game-char-2' ? 1 : 0);
            this._stageInit();
            const lockedName = isCall ? this.currentName : (this._stage[target] && this._stage[target].name);
            const lockedExp  = isCall ? this.currentExp  : (this._stage[target] && this._stage[target].exp);
            if (!lockedName) { this._hideEl(img); return; }
            const _stale = isCall ? (() => this.currentName !== lockedName)
                                  : (() => !this._stage[target] || this._stage[target].name !== lockedName);
            const base = VN_Config.data.charDefaultBase;

            const triggerAnim = (t) => {
                if (_stale()) return;
                t.classList.remove('vn-avatar');   // 預設立繪(presets) → 貼地
                t.classList.remove('sprite-shake', 'sprite-jumpscare', 'sprite-slide-in-right');
                void t.offsetWidth;
                if (t.dataset.slideIn === '1') { t.classList.add('sprite-slide-in-right'); delete t.dataset.slideIn; }
                else { if (lockedExp === 'Surprised') t.classList.add('sprite-shake'); if (lockedExp === 'JumpScare') t.classList.add('sprite-jumpscare'); }
            };

            if (base) {
                const urls = this._nameVariants(lockedName).map(v => `${base}${v}_presets.png`);
                this._tryLoad(img, urls, () => { if (_stale()) return; this.fallbackToAI(target, lockedName, lockedExp); }, isCall ? null : triggerAnim, _stale);
            } else {
                this.fallbackToAI(target, lockedName, lockedExp);
            }
        },
        
        // target：0/1 = 舞台格子；'call' = 通話頭像。雙格一律貼底立繪樣式(no-frame)，通話用 img.src
        fallbackToAI: async function(target, name, exp) {
            const isCall = (target === 'call');
            const img = isCall ? document.getElementById('call-avatar') : this._slotEl(target);
            if (!img) return;
            this._stageInit();
            const _stale = isCall ? (() => this.currentName !== name)
                                  : (() => !this._stage[target] || this._stage[target].name !== name);
            const showAvatar = (url) => {   // 頭像(世界書/AI生成/persona) → 浮起金框
                if (_stale()) return;
                if (isCall) { img.src = url; }
                else this._swapImage(img, url, true, _stale, () => this._applyAvatarAnim(img, exp));
            };
            const showSprite = (url) => {   // 預設立繪(剪影) → 貼地、不套框
                if (_stale()) return;
                if (isCall) { img.src = url; }
                else this._swapImage(img, url, false, _stale, () => this._applyAvatarAnim(img, exp));
            };

            // 世界書頭像
            if (!this._lorebookLoaded) { await this._loadLorebookAvatars(); this._lorebookLoaded = true; if (_stale()) return; }
            const lbUrl = this._lorebookAvatarCache[name] || this._lorebookAvatarCache[this._nameVariants(name).find(v => this._lorebookAvatarCache[v])];
            if (lbUrl) { showAvatar(lbUrl); return; }

            // 記憶體快取
            if (this._avatarMemCache[name]) { showAvatar(this._avatarMemCache[name]); return; }

            // 並發鎖：同角色生成中 → 等它
            if (this._pendingAvatars[name]) {
                await this._pendingAvatars[name];
                if (_stale()) return;
                if (this._avatarMemCache[name]) showAvatar(this._avatarMemCache[name]);
                return;
            }
            let _resolvePending;
            this._pendingAvatars[name] = new Promise(r => { _resolvePending = r; });
            try {
                const cached = await VN_Cache.get('avatar_cache', name);
                let url;
                if (cached && cached.url && !cached.url.startsWith('blob:')) {
                    const objUrl = await this._toObjectUrl(cached.url);
                    url = objUrl || cached.url; this._avatarMemCache[name] = url;
                } else {
                    let d = this._resolveAvatarPrompt(name);
                    if (!d) {
                        const pf = this._getPersonaFallback(name);
                        if (pf?.url) { url = pf.url; this._avatarMemCache[name] = url; }
                        else if (pf?.prompt) { d = pf.prompt; }
                        else {
                            const fb = VN_Config.data.finalFallbackSprite;
                            if (fb) showSprite(fb); else if (!_stale()) this._hideEl(img);
                            return;
                        }
                    }
                    if (!url && !d) return;
                    if (!url) {   // 還沒拿到圖才生成（pf.url 直接用）
                        const raw = await VN_Image.getAvatar(d, exp);
                        if (!raw) return;
                        try {
                            const fetchRes = await fetch(raw);
                            const blob = await fetchRes.blob();
                            const objUrl = URL.createObjectURL(blob);
                            const dataUrl = await new Promise(r => { const reader = new FileReader(); reader.onload = () => r(reader.result); reader.onerror = () => r(''); reader.readAsDataURL(blob); });
                            url = objUrl; this._avatarMemCache[name] = objUrl;
                            if (dataUrl) await VN_Cache.set('avatar_cache', name, { prompt: d, url: dataUrl });
                        } catch(e) {
                            url = await this._toDataUrl(raw);
                            if (url) { this._avatarMemCache[name] = url; await VN_Cache.set('avatar_cache', name, { prompt: d, url }); }
                        }
                    }
                }
                if (!url) { const fb = VN_Config.data.finalFallbackSprite; if (fb) showSprite(fb); else if (!_stale()) this._hideEl(img); return; }
                showAvatar(url);
            } finally {
                _resolvePending();
                delete this._pendingAvatars[name];
            }
        },

        _applyAvatarAnim: function(el, exp) {
            if (!el) return;
            const _exp = (exp !== undefined) ? exp : this.currentExp;
            el.classList.remove('sprite-shake', 'sprite-jumpscare');
            void el.offsetWidth;
            if (_exp === 'Surprised') el.classList.add('sprite-shake');
            if (_exp === 'JumpScare') el.classList.add('sprite-jumpscare');
        },

        // ===== 雙擊立繪 → 角色卡（名 / 一鍵生立繪+去背 / 當前CV+保存 / 形象 / 身分 / 好感度）=====
        _readCharState: function(name) {
            try {
                const cur = win._AVS_ENGINE?.read?.() || {};
                const box = cur['角色狀態'] || cur['角色状态'] || {};
                return box[name] || null;
            } catch (e) { return null; }
        },
        _charCV: function(name) {
            try {
                const T = win.VN_TTS;
                if (!T || !T.config) return null;
                const id = (T.config.charMappings && T.config.charMappings[name]) || (T._npcSessionCache && T._npcSessionCache[name]) || null;
                if (!id) return null;
                const model = T.config.models && T.config.models[id];
                const bound = !!(T.config.charMappings && T.config.charMappings[name]);
                return { id, name: (model && model.name) || id, bound };
            } catch (e) { return null; }
        },
        saveCharCV: function(name, btn) {
            try {
                const cv = this._charCV(name);
                if (!cv) { alert('這個角色目前沒有語音可保存'); return; }
                const T = win.VN_TTS;
                T.config.charMappings = T.config.charMappings || {};
                T.config.charMappings[name] = cv.id;
                if (typeof T.save === 'function') T.save();
                if (btn) { btn.textContent = '已保存 ✓'; btn.disabled = true; }
            } catch (e) { alert('保存失敗：' + (e?.message || e)); }
        },
        // 真懶人：用角色頭像提示詞 → 生 512×896 立繪 → AI 模型去背 → 存 sprite_cache → 立繪即時換上
        autoGenSprite: async function(name, btn) {
            const orig = btn ? btn.textContent : '';
            const setT = (t) => { if (btn) btn.textContent = t; };
            try {
                if (btn) btn.disabled = true;
                setT('🎨 生成中…');
                // 跟頭像 tab 的🎨同一套：套「全身框」前後綴(full body…) + 剝掉頭像特寫詞，512×896 直立全身比例
                const DEF_PREFIX = 'centered composition, entire body visible, body in frame, straight angle, solid background, (cowboy shot), full body, clothes and pants, school, ((detailed rendering)), clean and fluid linework, delicate and refined, ';
                const DEF_SUFFIX = '';
                const pfx = localStorage.getItem('os_sprite_tpl_prefix') || DEF_PREFIX;
                const sfx = localStorage.getItem('os_sprite_tpl_suffix') || DEF_SUFFIX;
                let rawP = String(this._resolveAvatarPrompt(name) || name);
                rawP = rawP.replace(/\b(bust shot|upper body|portrait|close[\s-]?up|headshot|looking at viewer|soft background|face focus)\b/gi, '').replace(/\s*,\s*,+/g, ', ').trim();
                const prompt = pfx + rawP + sfx;
                if (!win.OS_IMAGE_MANAGER || typeof win.OS_IMAGE_MANAGER.generate !== 'function') throw new Error('生圖引擎未就緒');
                const imCfg = win.OS_IMAGE_MANAGER.config;
                const useNAI = !!(imCfg && imCfg.service === 'novelai' && imCfg.novelai && imCfg.novelai.token);
                const url = await win.OS_IMAGE_MANAGER.generate(prompt, 'char', { force: true, width: 512, height: 896, raw: !useNAI });
                if (!url) throw new Error('生圖回傳空');
                const blob = await (await fetch(url)).blob();
                setT('🪄 去背中…');
                const m = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
                const removed = await m.removeBackground(blob, { model: 'isnet_fp16', output: { format: 'image/png', quality: 1.0 } });
                const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(removed); });
                if (!win.VN_Cache) throw new Error('VN_Cache 未就緒');
                await win.VN_Cache.set('sprite_cache', name, { url: dataUrl, isRemoved: true, createdAt: Date.now() });
                // 立繪即時換上：該角色所在格重渲染
                this._stageInit();
                for (let i = 0; i < 2; i++) { if (this._stage[i] && this._stage[i].name === name) { const el = this._slotEl(i); if (el) el.classList.remove('vn-avatar'); this._renderSlot(i, name, this._stage[i].exp); } }
                setT('✅ 完成');
                setTimeout(() => { setT(orig); if (btn) btn.disabled = false; }, 1500);
            } catch (e) {
                console.error('[CharCard] 一鍵生立繪失敗:', e);
                setT('❌ ' + (e && e.message ? e.message : '失敗'));
                setTimeout(() => { setT(orig); if (btn) btn.disabled = false; }, 2600);
            }
        },
        // 📱 觸控雙擊偵測 → 開角色卡（手機沒有 dblclick；桌機仍走 ondblclick）
        // 單擊不攔截（保留點立繪推進劇情）；只有第二擊命中才 preventDefault 並開卡片
        _spriteTap: function(idx, ev) {
            const now = Date.now();
            if (this._lastSpriteTapIdx === idx && (now - (this._lastSpriteTapT || 0)) < 350) {
                this._lastSpriteTapIdx = -1; this._lastSpriteTapT = 0;
                if (ev && ev.preventDefault)  ev.preventDefault();   // 第二擊不推進劇情
                if (ev && ev.stopPropagation) ev.stopPropagation();
                this.openCharCard(idx);
            } else {
                this._lastSpriteTapIdx = idx;
                this._lastSpriteTapT   = now;
            }
        },
        openCharCard: function(idx) {
            this._stageInit();
            const slot = this._stage[idx];
            if (!slot || !slot.name) return;
            const name = slot.name;
            const st = this._readCharState(name) || {};
            const cv = this._charCV(name);
            const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            let card = document.getElementById('vn-char-card');
            if (!card) { card = document.createElement('div'); card.id = 'vn-char-card'; (document.getElementById('page-game') || document.body).appendChild(card); }
            card.className = 'vn-cc ' + (idx === 0 ? 'vn-cc-left' : 'vn-cc-right');
            const affRaw = st['好感度'];
            const aff = (affRaw === null || affRaw === undefined || affRaw === '') ? '—' : affRaw;
            const cvText = cv ? (esc(cv.name) + (cv.bound ? '（已綁定）' : '')) : '—';
            card.innerHTML =
                '<div class="vn-cc-head"><span class="vn-cc-name"></span></div>' +
                '<button class="vn-cc-btn" id="vn-cc-gen">🎨 一鍵生立繪（去背）</button>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">當前 CV</span><span class="vn-cc-v">' + cvText + '</span>' + ((cv && !cv.bound) ? '<button class="vn-cc-mini" id="vn-cc-cv-save">💾 保存</button>' : '') + '</div>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">形象</span><span class="vn-cc-v">' + esc(st['形象'] || '—') + '</span></div>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">身分</span><span class="vn-cc-v">' + esc(st['身分'] || st['身份'] || '—') + '</span></div>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">好感度</span><span class="vn-cc-v">' + esc(aff) + '</span></div>';
            card.querySelector('.vn-cc-name').textContent = name;
            card.querySelector('#vn-cc-gen').onclick = (e) => this.autoGenSprite(name, e.currentTarget);
            const cvSaveBtn = card.querySelector('#vn-cc-cv-save');
            if (cvSaveBtn) cvSaveBtn.onclick = (e) => this.saveCharCV(name, e.currentTarget);
            card.style.display = 'block';
            this._ccIdx = idx;
            // 點卡片外面自動關（延遲一拍掛載，避免開卡這次的點擊立刻把它關掉）
            if (this._ccOutside) document.removeEventListener('pointerdown', this._ccOutside, true);
            this._ccOutside = (ev) => { const c = document.getElementById('vn-char-card'); if (c && c.style.display !== 'none' && !c.contains(ev.target)) this.closeCharCard(); };
            setTimeout(() => { document.addEventListener('pointerdown', this._ccOutside, true); }, 0);
        },
        closeCharCard: function() {
            const card = document.getElementById('vn-char-card');
            if (card) card.style.display = 'none';
            for (let i = 0; i < 2; i++) { const el = this._slotEl ? this._slotEl(i) : null; if (el) el.classList.remove('vn-cc-shift-l', 'vn-cc-shift-r'); }
            if (this._ccOutside) { document.removeEventListener('pointerdown', this._ccOutside, true); this._ccOutside = null; }
            this._ccIdx = null;
        }
    };
    // === 4. 全域 UI 輔助函數 ===

    function switchPage(id) {
        document.querySelectorAll('.page').forEach(e => e.classList.add('hidden'));
        const target = document.getElementById(id);
        if (target) target.classList.remove('hidden');
        if (id !== 'page-game') { const bgm = document.getElementById('bgm-player'); if (bgm) { bgm.pause(); bgm.currentTime = 0; } }
        // 進入 VN 劇情時暫停大廳 BGM，避免兩條音樂重疊；離開時恢復
        try {
            if (id === 'page-game') {
                if (win.VoidTerminal?.suspendLobbyActivity) win.VoidTerminal.suspendLobbyActivity();
                else if (win.VoidAmbient?.pauseBgm) win.VoidAmbient.pauseBgm();
            } else {
                if (win.VoidTerminal?.resumeLobbyActivity) win.VoidTerminal.resumeLobbyActivity();
            }
        } catch(e) {}
    }

    function stopGame() {
        // 退出遊戲才真正清空頭像快取（跨章節期間保留）
        for (const url of Object.values(window.VN_Core._avatarMemCache || {})) {
            if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        }
        window.VN_Core._avatarMemCache = {};
        window.VN_Core.avatars = {};
        window.VN_Core.resetState();
        const bgm = document.getElementById('bgm-player');
        if (bgm) { bgm.pause(); bgm.currentTime = 0; }
        const pageGame = document.getElementById('page-game');
        if (pageGame) pageGame.classList.add('hidden');
        if (window.AureliaControlCenter?.hideVnPanel) window.AureliaControlCenter.hideVnPanel();
    }

    // === 5. 導出到 Window ===
    window.VN_Core = VN_Core;

    window.VN_PLAYER = {
        launchApp,
        switchPage, stopGame, openChapterPanel, closeChapterPanel,
        openGameSettings, closeGameSettings, openChatBgPanel, closeChatBgPanel, handleChatBgFile,
        applyChatBgUrl, clearChatBg,
        openGeneratePanel, closeGeneratePanel, generateStory, diveSelectedCard,
        resetPromptOrder() { VN_PromptOrder.reset(); },
        loadAvatarManager,   // 供 vn_settings.js 外接調用（接受自定義 listId）
        loadBgManager,       // 供 vn_settings.js 外接調用（BG 快取列表）
        loadSpriteManager,   // 立繪庫網格（sprite_cache，世界感知）

        // 💭 本章思考鏈小窗
        showThinkPopup() {
            const popup = document.getElementById('vn-think-popup');
            if (!popup) return;
            if (popup.classList.contains('active')) { this.hideThinkPopup(); return; }
            const body = document.getElementById('vn-think-popup-body');
            // OS_THINK.log 最新一筆（entries.unshift，index 0 = 最新）
            const lastEntry = win.OS_THINK?.getLatest();
            let thinkContent = lastEntry?.content?.trim() || '';
            // 酒館模式 OS_THINK 不在 → 讀酒館原生 reasoning（最近一則 AI 訊息的 extra.reasoning）
            if (!thinkContent) thinkContent = (win.AureliaAPI || window.AureliaAPI)?.getLatestReasoning?.() || '';
            body.innerHTML = thinkContent
                ? thinkContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
                : '<div class="think-empty-msg">本章無思考記錄<br><small>（需啟用 enable_thinking 且 AI 支援）</small></div>';
            popup.classList.add('active');
            // 點彈窗外面 → 關閉（click capture，吃掉這次點擊避免順便推進劇情；排除 COT 按鈕本身）
            const self = this;
            this._thinkAway = function(e) {
                if (popup.contains(e.target)) return;
                if (e.target.closest && e.target.closest('#vn-btn-think')) return;
                e.stopPropagation();
                self.hideThinkPopup();
            };
            setTimeout(function () { document.addEventListener('click', self._thinkAway, true); }, 0);
        },
        hideThinkPopup() {
            document.getElementById('vn-think-popup')?.classList.remove('active');
            if (this._thinkAway) { document.removeEventListener('click', this._thinkAway, true); this._thinkAway = null; }
        },

        // 📖 劇情閱讀器（轉發給獨立模組 VN_READER）
        async showReaderPanel() {
            if (win.VN_READER) { win.VN_READER.show(); return; }
            const overlay = document.getElementById('vn-reader-overlay');
            if (!overlay) return;
            overlay.classList.add('active');
            const body = document.getElementById('vn-reader-body');
            body.innerHTML = '<div class="vn-reader-loading">載入中...</div>';

            let allChapters = [];
            try { allChapters = await (win.OS_DB?.getAllVnChapters?.() || []); } catch(e) {}

            if (!allChapters.length) {
                body.innerHTML = '<div class="vn-reader-loading" style="color:#333">尚無章節記錄</div>';
                return;
            }

            // ── 按 storyId 分組，從新到舊排列故事 ──
            const _rGroups = {};
            allChapters.forEach(ch => {
                const gid = ch.storyId || '__legacy__';
                if (!_rGroups[gid]) _rGroups[gid] = { storyTitle: ch.storyTitle || '舊版資料', storyId: ch.storyId || '', chapters: [] };
                _rGroups[gid].chapters.push(ch);
            });
            const _rSortedGroups = Object.values(_rGroups).sort((a, b) => {
                const aMax = Math.max(...a.chapters.map(c => c.createdAt || 0));
                const bMax = Math.max(...b.chapters.map(c => c.createdAt || 0));
                return bMax - aMax;
            });

            // 預設顯示當前故事，找不到則第一個
            const _rCurrentId = window.VN_Core?._currentStoryId || '';
            let _rActiveGroup = _rSortedGroups.find(g => g.storyId && g.storyId === _rCurrentId) || _rSortedGroups[0];

            // ── 建立 Tab 列（多故事才顯示）──
            const tabsEl = document.getElementById('vn-reader-tabs');
            tabsEl.innerHTML = '';
            if (_rSortedGroups.length > 1) {
                tabsEl.style.display = 'flex';
                _rSortedGroups.forEach(group => {
                    const tab = document.createElement('div');
                    tab.className = 'vn-reader-tab' + (group === _rActiveGroup ? ' active' : '');
                    tab.textContent = group.storyTitle;
                    tab.onclick = () => {
                        tabsEl.querySelectorAll('.vn-reader-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        _renderStoryChapters(group.chapters);
                    };
                    tabsEl.appendChild(tab);
                });
            } else {
                tabsEl.style.display = 'none';
            }

            // stripVnTags 本地實作（不依賴 os_api_engine 的私有函數）
            function _strip(text) {
                if (!text) return '';
                let s = text;
                // 1. 先移除不需要顯示的整個 block（順序很重要，必須在剝 tag 之前）
                s = s.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '');
                s = s.replace(/<summary>[\s\S]*?<\/summary>/gi, '');
                s = s.replace(/<avatar>[\s\S]*?<\/avatar>/gi, '');
                s = s.replace(/<status>[\s\S]*?<\/status>/gi, '');
                // 2. 從 <content> block 取正文（若有），移除包裹 tag
                const contentM = s.match(/<content>([\s\S]*?)<\/content>/i);
                if (contentM) s = contentM[1];
                else s = s.replace(/<\/?(content)[^>]*>/gi, '');
                // 3. 轉換 VN inline tag 為可讀文字
                s = s.replace(/\[Char\|([^|]+)\|[^|]*\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, n, d) => `${n.trim()}：${d.trim()}`);
                s = s.replace(/\[Nar\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, t) => `　　${t.trim()}`);
                s = s.replace(/\[Inner\|[^|]+\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, t) => `（${t.trim()}）`);
                s = s.replace(/\[(Story|Chapter|Protagonist|Area|BGM|Bg|Trans|Item|SessionEnd|Achievement|Choice|Quest)[^\]]*\]/gi, '');
                s = s.replace(/\[[^\[\]\n]{1,80}\]/g, '');
                // 4. 清除剩餘 HTML tag
                s = s.replace(/<[^>]+>/g, '');
                s = s.replace(/\n{3,}/g, '\n\n').trim();
                return s;
            }

            // 轉換純文字為 HTML（保留段落與換行）
            function _toHtml(text) {
                return text
                    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/\n\n+/g, '</p><p style="margin:0 0 0.8em">')
                    .replace(/\n/g, '<br>');
            }

            function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

            // ── 渲染指定故事的章節到 body ──
            function _renderStoryChapters(storyChapters) {
                // 從舊到新排列
                const sorted = [...storyChapters].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                if (!sorted.length) {
                    body.innerHTML = '<div class="vn-reader-loading" style="color:#333">此故事無章節記錄</div>';
                    return;
                }
                let html = '';
                sorted.forEach((ch, i) => {
                    const id = ch.id || `ch_${i}`;
                    const userText  = ch.request ? esc(ch.request) : '';
                    const novelText = `<p style="margin:0">${_toHtml(_strip(ch.content || ''))}</p>`;
                    const rawText   = esc(ch.content || '');
                    const thinkText = esc(ch.thinking || '');
                    const ts = ch.createdAt ? new Date(ch.createdAt).toLocaleString('zh-TW') : '';

                    html += `<div class="vn-reader-divider">── CH.${String(i+1).padStart(2,'0')} ${esc(ch.title || '')} · ${ts} ──</div>`;

                    if (userText) {
                        html += `<div class="vn-reader-msg user">
                            <div class="vn-reader-label">👤 用戶</div>
                            <div class="vn-reader-bubble">${userText}</div>
                        </div>`;
                    }

                    const thinkBlock = thinkText ? `
                        <div class="vn-reader-think-wrap" id="rth-${id}">
                            <div class="vn-reader-think-hd" onclick="vnThinkToggle('${id}')">
                                <span class="rth-arrow">▶</span>
                                <span>思考了一段時間</span>
                            </div>
                            <div class="vn-reader-think-body">${thinkText}</div>
                        </div>` : '';

                    html += `<div class="vn-reader-msg ai">
                        <div class="vn-reader-label">🤖 AI</div>
                        ${thinkBlock}
                        <div class="vn-reader-bubble" id="rb-novel-${id}">${novelText || '<span style="color:#333">（無內容）</span>'}</div>
                        <div class="vn-reader-actions">
                            <button class="vn-reader-act-btn" onclick="vnReaderToggle('raw','${id}',this)">📄 原始 tag</button>
                        </div>
                        <div class="vn-reader-extra raw" id="rb-raw-${id}">${rawText}</div>
                    </div>`;
                });

                body.innerHTML = html;
                body.scrollTop = body.scrollHeight;
            }

            // 思考摺疊切換（全域，供 onclick 呼叫）
            win.vnThinkToggle = function(id) {
                document.getElementById(`rth-${id}`)?.classList.toggle('open');
            };
            win.vnReaderToggle = function(type, id, btn) {
                const el = document.getElementById(`rb-${type}-${id}`);
                if (!el) return;
                const isOpen = el.classList.contains('active');
                btn.closest('.vn-reader-actions')?.querySelectorAll('.vn-reader-act-btn').forEach(b => b.classList.remove('active'));
                el.classList.toggle('active', !isOpen);
                if (!isOpen) btn.classList.add('active');
            };

            // 初始渲染：顯示預設故事
            _renderStoryChapters(_rActiveGroup.chapters);
        },
        hideReaderPanel() {
            if (win.VN_READER) { win.VN_READER.hide(); return; }
            document.getElementById('vn-reader-overlay')?.classList.remove('active');
        },

        // 📝 大總結 編輯器（在閱讀器內開啟）
        async showSummaryEditor() {
            if (win.VN_READER) { win.VN_READER.showSummaryEditor(); return; }
            const body = document.getElementById('vn-reader-body');
            const tabs = document.getElementById('vn-reader-tabs');
            if (!body) return;

            // 暫存章節內容以便返回
            body._prevHtml   = body.innerHTML;
            body._prevScroll = body.scrollTop;
            if (tabs) { body._prevTabsDisplay = tabs.style.display; tabs.style.display = 'none'; }

            body.innerHTML = '<div style="padding:20px;color:#555;font-size:0.85rem;">載入大總結中...</div>';

            const storyId = localStorage.getItem('vn_current_story_id') || '';
            let summaries = [];
            try {
                if (win.OS_DB?.getGrandSummaries) summaries = await win.OS_DB.getGrandSummaries(storyId);
            } catch(e) {}

            if (!summaries.length) {
                body.innerHTML = `
                    <div style="display:flex;flex-direction:column;height:100%;padding:20px;box-sizing:border-box;">
                        <div style="color:#555;font-size:0.85rem;margin-bottom:16px;">尚無大總結記錄。Token 達 70% 時可在 CTX 彈窗中生成。</div>
                        <button onclick="window.VN_PLAYER.hideSummaryEditor()" style="align-self:flex-start;background:transparent;border:1px solid rgba(212,175,55,0.25);color:#888;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:0.82rem;">← 返回閱讀器</button>
                    </div>`;
                return;
            }

            const latest = summaries.reduce((a, b) => (a.count >= b.count ? a : b));
            // 儲存 entry 參考
            body._summaryEntry = latest;

            const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const ts = latest.timestamp ? new Date(latest.timestamp).toLocaleString('zh-TW') : '';

            body.innerHTML = `
                <div style="display:flex;flex-direction:column;height:100%;padding:16px;box-sizing:border-box;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <div style="color:#d4af37;font-size:0.82rem;letter-spacing:1px;">📝 大總結（第 ${latest.count} 次）<span style="color:#555;font-size:0.75rem;margin-left:8px;">${ts}</span></div>
                        <div style="color:#555;font-size:0.72rem;">覆蓋 ${(latest.coveredChapterIds||[]).length} 章</div>
                    </div>
                    <textarea id="vn-summary-edit-area"
                        style="flex:1;width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.18);
                               color:#e8dfc8;padding:12px;border-radius:6px;font-family:monospace;font-size:0.78rem;
                               resize:none;line-height:1.6;box-sizing:border-box;outline:none;"
                        spellcheck="false">${esc(latest.content)}</textarea>
                    <div style="display:flex;gap:8px;margin-top:12px;flex-shrink:0;">
                        <button onclick="window.VN_PLAYER.hideSummaryEditor()"
                            style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#888;
                                   padding:7px 18px;border-radius:4px;cursor:pointer;font-size:0.82rem;">← 返回</button>
                        <button onclick="window.VN_PLAYER.saveSummaryEdit()"
                            style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.35);color:#d4af37;
                                   padding:7px 18px;border-radius:4px;cursor:pointer;font-size:0.82rem;flex:1;">💾 儲存修改</button>
                    </div>
                </div>`;
        },

        hideSummaryEditor() {
            if (win.VN_READER) { win.VN_READER.hideSummaryEditor(); return; }
            const body = document.getElementById('vn-reader-body');
            const tabs = document.getElementById('vn-reader-tabs');
            if (!body) return;
            if (body._prevHtml !== undefined) {
                body.innerHTML = body._prevHtml;
                body.scrollTop = body._prevScroll || 0;
            }
            if (tabs && body._prevTabsDisplay !== undefined) tabs.style.display = body._prevTabsDisplay;
        },

        async saveSummaryEdit() {
            if (win.VN_READER) { win.VN_READER.saveSummaryEdit(); return; }
            const body = document.getElementById('vn-reader-body');
            const textarea = document.getElementById('vn-summary-edit-area');
            if (!textarea || !body?._summaryEntry) return;
            const newContent = textarea.value;
            const entry = { ...body._summaryEntry, content: newContent };
            try {
                await win.OS_DB?.saveGrandSummary(entry);
                // 視覺回饋
                const saveBtn = textarea.closest('div').nextElementSibling?.querySelector('button:last-child');
                if (saveBtn) { const orig = saveBtn.textContent; saveBtn.textContent = '✓ 已儲存'; setTimeout(() => { saveBtn.textContent = orig; }, 1500); }
                body._summaryEntry = entry;
            } catch(e) {
                alert('儲存失敗: ' + (e.message || e));
            }
        }
    };

    // === 6. 啟動程序 ===
    function launchApp(container) {
        if (!window.VN_STYLES || !window.VN_STYLES.vnHTML) {
            console.error('[VN_Core] 找不到 window.VN_STYLES.vnHTML，請確認 vn_styles.js 已先載入！');
            return;
        }

        container.innerHTML = window.VN_STYLES.vnHTML;

        VN_Config.load();
        VN_Settings.load();
        loadSavedChatBg();
        VN_Sticker.init();
        
        // 啟動時初始化主頁背景音樂按鈕與播放狀態
        if (window.VN_Core.updateHomeBgmState) {
            window.VN_Core.updateHomeBgmState();
        }

        if (window._pendingAutoScript) {
            const _pending = window._pendingAutoScript;
            window._pendingAutoScript = null;
            setTimeout(() => {
                const _pScript = typeof _pending === 'object' ? _pending.text : _pending;
                const _pMsgId  = typeof _pending === 'object' ? _pending.messageId : null;
                window.VN_Core.loadScript(_pScript, _pMsgId);
                switchPage('page-game');
                window.VN_Core.next();
                console.log('[PhoneOS] 自動偵測：已套用暫存劇本');
            }, 150);
        }

        // 自由書籍 Dive：從書架自由劇情書過來
        if (window._pendingFreeScriptDive && (win.OS_API?.isStandalone?.() ?? false)) {
            const _free = window._pendingFreeScriptDive;
            window._pendingFreeScriptDive = null;
            setTimeout(() => {
                const genInput = document.getElementById('vn-gen-request');
                const genTitle = document.getElementById('vn-gen-title');
                if (genInput) genInput.value = _free.request;
                if (genTitle) genTitle.value = _free.title || '';
                generateStory();
                console.log('[VN] 自由書籍 Dive 觸發生成:', _free.title || '（無標題）');
            }, 300);
        }

        // QB Dive：靜默填入 prompt，直接觸發生成（獨立路徑，不開首頁生成 overlay）
        if (window._pendingQBPayload && (win.OS_API?.isStandalone?.() ?? false)) {
            const _qbPayload = window._pendingQBPayload;
            window._pendingQBPayload = null;
            setTimeout(() => {
                const genInput = document.getElementById('vn-gen-request');
                const genTitle = document.getElementById('vn-gen-title');
                if (genInput) genInput.value = _qbPayload.startPrompt;
                if (genTitle) genTitle.value = _qbPayload.title || '';
                generateStory();
                console.log('[VN] QB Dive 觸發生成:', _qbPayload.title);
            }, 300);
        }
    }

    function install() {
        if (win.PhoneSystem) {
            win.PhoneSystem.install('視覺終端', '🎭', '#111', launchApp);
            console.log('[PhoneOS] VN 視覺終端播放器已安裝 (V8.6 - 核心模組化 + SFX優化 + 主頁BGM)');
        } else { setTimeout(install, 1000); }
    }
    install();

    // === 7. QB 劇本包接收（來自 qb_core diveQuest） ===
    window._pendingQBPayload = window._pendingQBPayload || null;
    win.addEventListener('VN_STORY_STARTED', function(e) {
        const isStandalone = win.OS_API?.isStandalone?.() ?? false;
        if (!isStandalone) return; // 只在獨立模式有效，確保不污染酒館模式
        const payload = e.detail;
        if (!payload || !payload.startPrompt) return;
        window._pendingQBPayload = payload;
        console.log('[VN] 收到 VN_STORY_STARTED，暫存 QB 劇本包:', payload.title);
    });

    // === 8. 自動偵測新劇本 ===
    window._pendingAutoScript = window._pendingAutoScript || null;

    (function _setupAutoDetect() {
        if (window._VN_AUTO_DETECT_REGISTERED) return;
        window._VN_AUTO_DETECT_REGISTERED = true;

        const _processedIds = new Set();

        function init() {
            if (!window.TavernHelper) { setTimeout(init, 1000); return; }
            if (!window.eventOn || !window.tavern_events) { setTimeout(init, 500); return; }

            window.eventOn(window.tavern_events.MESSAGE_RECEIVED, (messageId) => {
                if (_processedIds.has(messageId)) return;
                _processedIds.add(messageId);

                try {
                    // 快速確認：原始訊息是否含 <content>（決定要不要啟動）
                    let text = '';
                    const stCtx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
                    if (stCtx && stCtx.chat && stCtx.chat[messageId]) {
                        const m = stCtx.chat[messageId];
                        text = m.mes || m.message || m.content || '';
                    }
                    if (!text) {
                        const msgs = window.TavernHelper.getChatMessages(messageId);
                        if (msgs && msgs.length > 0) {
                            text = msgs[0].message || msgs[0].mes || msgs[0].content || '';
                        }
                    }

                    if (!text.includes('<content>')) { _processedIds.delete(messageId); return; }

                    const _vnPanel = document.getElementById('aurelia-vn-panel');
                    const _vnVisible = _vnPanel && _vnPanel.style.display !== 'none';
                    if (_vnVisible && document.getElementById('page-game')) {
                        switchPage('page-game');
                        window.VN_Core.loadScript(text, messageId);
                        window.VN_Core.next();
                        console.log('[PhoneOS] 自動偵測：已套用新劇本 (訊息 ID:', messageId, ')');
                    } else {
                        window._pendingAutoScript = { text: text, messageId: messageId };
                        console.log('[PhoneOS] 自動偵測：劇本已暫存，待開啟 VN app 後套用');
                    }
                } catch (e) {
                    console.error('[PhoneOS] 自動偵測失敗:', e);
                    _processedIds.delete(messageId);
                }
            });

            if (window.tavern_events.CHAT_CHANGED) {
                window.eventOn(window.tavern_events.CHAT_CHANGED, () => _processedIds.clear());
            }

            console.log('[PhoneOS] VN 自動劇本偵測已啟動');
        }
        init();
    }());

})();
