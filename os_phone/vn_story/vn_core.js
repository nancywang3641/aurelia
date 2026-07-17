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
        script: [], index: -1, avatars: {}, charVoices: {}, currentName: '', currentExp: '', mode: 'vn',
        _lastBgCacheId: '', // 跨章節持久，存 cacheId 而非 URL（blob 會被 resetState 撤銷）
        _bgMemCache: {},
        _bgInflight: {},   // 進行中的背景生成(cacheId→promise)：去重，避免預熱+現場對同一場景各生一張(競態→重開不同圖)
        _bgFailed: {},     // 同 _sceneFailed：背景生圖失敗的 cacheId → 不自動重打(治「背景重複生成兩次」白燒額度)；切新背景=新 cacheId 不受影響
        _sceneMemCache: {},
        _sceneInflight: {}, // 進行中的場景CG生成(cacheId→promise)：同 _bgInflight，防預熱+現場重複生成
        _sceneFailed: {},   // 生圖失敗過的 cacheId(→ts)：in-flight 解析後就清、防不住「預熱+插入+渲染序列重打」→ 記失敗、同 cacheId 不再自動重生(白燒額度/被風控)；按 🔄 重生會清掉
        _sceneCgLinger: 0,  // 鋪底式場景插圖剩餘停留句數（3→0 淡出）；0=沒在顯示
        _sceneCgCur: null,  // 當前鋪底插圖的 {cacheId, prompt}，給「🔄 重生」鈕重打用（不碰 LLM）
        _sceneCgHold: false,    // 失敗佔位 hold：true=不淡出(停在佔位卡讓玩家手動重生)；成功才解除
        _sceneCgFailLinger: 0,  // 失敗佔位寬限句數(3→0)：玩家沒手動重生也會自己淡掉、不永遠卡著
        _sceneGenBackoff: 0,    // 本輪插圖退避：撞失敗(拼車 NAI 429)後設時戳→後續插圖不再自動猛打；手動重生/新一輪清
        _itemMemCache: {},
        _itemInflight: {},  // 進行中的道具圖生成(itemName→promise)：同 _bgInflight
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

        // ── 備份頭像快取 → 角色卡主世界書（手動，圖片設置按鈕觸發）──────────────
        // 目的：IDB 本地頭像快取萬一丟失，至少能從酒館「角色世界書」找回。
        // 寫進當前角色卡主世界書 getCharLorebooks().primary（★非聊天世界書），
        // 條目 comment 對齊 _loadLorebookAvatars 會讀的【素材-角色頭像素材】、格式「名字:圖」，
        // 條目設 enabled:false + 不觸發 keys → 純倉庫、絕不注入 AI／不燒 token。
        // 合併制：既有條目保留、當前世界頭像覆蓋同名 → 備份只增不減。
        backupAvatarsToCharLorebook: async function() {
            const TH = win.TavernHelper;
            if (!TH || !TH.getCharLorebooks || !TH.getLorebookEntries) return { ok:false, msg:'TavernHelper 世界書 API 不可用' };
            let lb = '';
            try { const c = TH.getCharLorebooks(); lb = c && c.primary; } catch(e) {}
            if (!lb) return { ok:false, msg:'當前角色卡沒有綁定「角色世界書」（主世界書），無法備份' };

            // 收集當前世界的頭像（只取持久的 dataURL；blob 不可重用→跳過）
            const all = await VN_Cache.getAll('avatar_cache');
            const curWorld = VN_Cache.getCurrentWorld();
            const cur = {};   // 名字 → dataURL
            for (const e of (all || [])) {
                if (!e || !e.url || e.url.indexOf('data:') !== 0) continue;
                if (VN_Cache.worldOf(e) !== curWorld) continue;
                const k = String(e.key || '');
                const sep = k.indexOf('::');
                const name = sep >= 0 ? k.slice(sep + 2) : k;
                if (name) cur[name] = e.url;
            }
            if (!Object.keys(cur).length) return { ok:false, msg:'當前世界沒有可備份的頭像快取' };

            // 讀既有條目→合併（保留舊備份與別名，當前世界覆蓋同名）
            const COMMENT = '【素材-角色頭像素材】';
            const entries = await TH.getLorebookEntries(lb);
            const existing = (entries || []).find(en => en.comment === COMMENT);
            const merged = {};
            if (existing && existing.content) {
                existing.content.split('\n').forEach(line => {
                    const t = line.trim();
                    if (!t || t.startsWith('//')) return;
                    const i = t.indexOf(':');
                    if (i > 0) merged[t.slice(0, i).trim()] = t.slice(i + 1);   // 保留 URL（含 |別名）
                });
            }
            let added = 0;
            for (const n of Object.keys(cur)) { if (!(n in merged)) added++; merged[n] = cur[n]; }
            const content = Object.keys(merged).map(n => `${n}:${merged[n]}`).join('\n');

            if (existing) {
                await TH.setLorebookEntries(lb, [{ uid: existing.uid, content }]);
            } else {
                await TH.createLorebookEntries(lb, [{
                    comment: COMMENT, content, enabled: false,
                    keys: ['頭像素材_倉庫_請勿觸發_DO_NOT_TRIGGER'],
                }]);
            }
            return { ok:true, msg:`已備份 ${Object.keys(cur).length} 個頭像到角色世界書「${lb}」（新增 ${added}）`, count: Object.keys(cur).length, lorebook: lb };
        },

        resetState: function() {
            this.clearTimers();
            this._twTimer = null;
            this._autoTimer = null;
            this._twEl = null;
            this._twFull = '';
            this.script = [];
            this.index = -1;
            this._pendingLeave = [];   // 清掉上一份劇本殘留的 |Leave 待離場
            this.avatars = {};
            this.charVoices = {};   // [Avatar|名|聲線|外觀] 宣告的固定聲線（名→聲線）；[Char] 不再每行帶
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
                'dialogue-text': '',   // 不放「讀取中...」裸字——等待狀態一律由全黑 loading 面板呈現
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
            if (sceneCgOverlay) sceneCgOverlay.classList.remove('active', 'scene-cg-failed');
            const sceneCgImg = document.getElementById('scene-cg-img');
            if (sceneCgImg) sceneCgImg.src = '';
            this._sceneCgLinger = 0;
            this._sceneCgHold = false;
            this._sceneCgFailLinger = 0;
            this._sceneGenBackoff = 0;   // 新章節/新一輪：解除插圖退避，重新嘗試生圖

            const bg = document.getElementById('game-bg');
            if (bg) {
                if (this._lastBgCacheId) {
                    // 有上一章背景：cacheId 存活，從 IDB 重新取 URL（blob 已被 resetState 撤銷）
                    this._setBgImage(bg, '');
                    const _cid = this._lastBgCacheId;
                    (async () => {
                        const cached = await VN_Cache.get('bg_cache', _cid);
                        console.log('[VN_Core🔎] 背景持久還原 cid=' + _cid + ' → IDB ' + (cached && cached.url ? '命中' : '撈空(上輪生成沒寫進IDB)'));
                        if (cached && cached.url && bg) {
                            const objUrl = await this._toObjectUrl(cached.url).catch(() => null);
                            let finalUrl = objUrl || cached.url;
                            if (cached.fallback && !String(finalUrl).includes('#fallback')) finalUrl += '#fallback';
                            this._setBgImage(bg, finalUrl);
                        }
                    })();
                } else {
                    console.log('[VN_Core🔎] 背景持久：_lastBgCacheId 為空 → 不還原(上輪沒成功背景，或 VN_Core 被重建)');
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

        // ── [Avatar] 宣告的固定聲線：按 chatId 持久化（localStorage 同步、loadScript 能直接讀）──
        //   不存就只在「有 [Avatar] 那則」有效，之後的回合/大總結壓掉舊訊息/重載 → 聲線丟失。
        _charVoicesKey: function() {
            let cid = '';
            try { const w = window.parent || window; const ctx = w.SillyTavern && w.SillyTavern.getContext && w.SillyTavern.getContext(); if (ctx && ctx.chatId) cid = String(ctx.chatId); } catch(e){}
            if (!cid) { try { const w = window.parent || window; if (w.VoidTerminal && w.VoidTerminal.getChatId) cid = String(w.VoidTerminal.getChatId() || ''); } catch(e){} }
            return 'vn_charvoices::' + (cid || 'lobby_default');
        },
        _loadCharVoices: function() {
            try { const raw = localStorage.getItem(this._charVoicesKey()); if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') return o; } } catch(e){}
            return {};
        },
        _saveCharVoices: function() {
            try { localStorage.setItem(this._charVoicesKey(), JSON.stringify(this.charVoices || {})); } catch(e){}
        },

        loadScript: function (txt, messageId) {
            // 新一輪劇本載入時，自動關閉檔案庫面板
            if (window.AureliaHtmlExtractor && window.AureliaHtmlExtractor.isVisible) {
                window.AureliaHtmlExtractor.hide();
            }
            this.resetState();
            this._currentMessageId = messageId || null; // resetState 後覆寫，確保拿到正確 ID
            this.charVoices = this._loadCharVoices();   // 先載入本卡持久化的固定聲線（跨訊息/大總結/重載留存），下面解析 [Avatar] 再合併
            // 🔄 學 PWA：重抓創作室（展廳）已啟用模板，確保跨視窗新增/啟用的 tag 生效。
            //    ⚠️ 不可 await（呼叫端是 loadScript()→next() 同步契約，await 會讓 next() 在空腳本上跑→劇情跳過）。
            //    fire-and-forget：本次載入吃現有快取，刷新供後續播放/下次開播用。
            try { if (window.VN_DynamicParser && window.VN_DynamicParser.init) window.VN_DynamicParser.init(); } catch (e) {}
            // 🎨 套用此世界(chatId)的自訂 VN 面板 CSS
            try { if (window.VN_Theme) window.VN_Theme.apply(); } catch (e) {}
            // ⚠️ 先剝 CoT 再取正文：<thinking> 裡常「提到」<content>（格式自檢清單），直接抓會從思考區開抓、把 CoT 包進正文
            const _txtNoCot = String(txt).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
            const contentMatch = _txtNoCot.match(/<content>([\s\S]*?)<\/content>/i);
            let storyText = contentMatch ? contentMatch[1] : _txtNoCot;
            // 卡自帶「AI 直出裸 HTML 美化卡」(無正則參與、無自訂 tag 包裹)：先整塊收走，
            // 免得下面按行切割把 <div style=…> 拆成碎旁白（美化卡整個散架）
            storyText = this._extractRawHtmlCards(storyText);

            // 解析 <branches> 區塊（位於 <content> 外，作為一次性選擇，不進入 AI 上下文）；同樣避開 CoT 裡的假 branches
            const branchesMatch = _txtNoCot.match(/<branches>([\s\S]*?)<\/branches>/i);
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
            // 切割：AI 常把旁白和 [Char|...] 擠在同一行（旁白混進對話泡）→ 拆成獨立行，
            //   每個 [Char|...] 自成一行、中間/前後的旁白各自一行，下游照常渲染對話泡/旁白。
            //   不靠 AI 守排版規範，腳本端硬切（同 WX 拆 [图片:] 的思路）。
            this.script = this.script.flatMap(l => {
                if (l.indexOf('[Char|') === -1) return [l];
                const re = /\[Char\|[^\]]*\]/g;
                const out = []; let last = 0, m;
                while ((m = re.exec(l)) !== null) {
                    if (m.index > last) { const before = l.slice(last, m.index).trim(); if (before) out.push(before); }
                    out.push(m[0]);
                    last = re.lastIndex;
                }
                const tail = l.slice(last).trim(); if (tail) out.push(tail);
                return out.length ? out : [l];
            });
            // 容錯：AI 被其他 TAG 格式污染時會把 <call> 寫成方括號版
            // （[Call character="X"] / [/Call]，大小寫、單雙引號、無引號都見過）→ 正規化回標準標籤，
            // 統一成雙引號讓 VN_Phone.initCall 的 character="..." 解析吃得到
            this.script = this.script.map(l => {
                const mOpen = l.match(/^\[call\s+character\s*=\s*["']?([^"'\]]+?)["']?\s*\]$/i);
                if (mOpen) return `<call character="${mOpen[1]}">`;
                if (/^\[\/call\s*\]$/i.test(l)) return '</call>';
                return l;
            });

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

            // 2. 新式 [Avatar|名|外觀] 或 [Avatar|名|聲線|外觀]（聲線宣告一次、跟著角色走；描述/外觀內禁含 |）
            const regAvNew = /^\s*\[Avatar\|([^|\]\n]+)\|([^\]\n]+)\]\s*$/gmi;
            while ((m = regAvNew.exec(txtString)) !== null) {
                const _an = m[1].trim();
                const _rest = m[2].split('|').map(s => s.trim());
                let _voice = '', _ad = '';
                if (_rest.length >= 2) { _voice = _rest[0]; _ad = _rest.slice(1).join(' '); }  // 名|聲線|外觀
                else { _ad = _rest[0]; }                                                          // 名|外觀（舊式，無聲線）
                if (_an && _ad) this.avatars[_an] = _ad;
                if (_an && _voice) this.charVoices[_an] = _voice;
            }
            this._saveCharVoices();   // 本則新宣告的聲線寫回持久化（合併制，只增不洗）
            // [Avatar|...] 是生成指令不是劇情行：從劇本剔除（卡片與對話框都不該顯示原始行）
            this.script = this.script.filter(l => !/^\[Avatar\|/i.test(l));

            // 將 <branches> 選項附加到 script 末尾（由現有 [Choice|] 機制驅動顯示）
            if (_branchLines.length) {
                this.script.push(..._branchLines);
            }

            this._hoistSceneDirectivesFromDynBlocks();  // 卡片區塊內的 [BGM]/[Bg] 提副本到區塊前，讓引擎照常播
            // 副模型場景插圖：把「最新這輪」剛排隊的 scenes splice 進剛載入的劇本（在預熱前，讓它也被預熱）。
            //   ★不靠 ID 撈 _pending(窗口號每輪都撞 key→回放舊章節會誤撈最新圖)，改用 _latest(最新這輪、用完即清)。
            //   回放舊章節時 _latest 是 null → 不會誤插；舊章節的圖由 vn_panels 的 applyChapterScenes(存檔 scenes) 負責。
            console.log('[VN_Core🔎] loadScript 完成 msg#' + this._currentMessageId + ' script長=' + (Array.isArray(this.script) ? this.script.length : 'N/A') + ' → 試插最新這輪場景');
            try { if (window.VN_SceneInsert) window.VN_SceneInsert.applyLatestFresh(); } catch (e) {}
            this._prewarmBgs();
            this._prewarmScenes();
            this._prewarmItems();
            this._prewarmAvatars();
            this._deferVoicePrewarm();   // 語音延後：等圖片預熱清空才開跑（圖片優先進顯卡）
            this._startImgGate = true;   // 開場閘門上膛：第一行劇情文本渲染前檢查圖片（卡片/指令不受影響）
        },

        // 語音預熱延後啟動：圖片（頭像/背景/場景/道具）全部清空才放語音佇列進場。
        // 「進劇情前圖片全到位」的另一半——loading 擋播放、這裡擋語音，兩邊都讓圖片先吃滿 GPU。
        // 上限 5 分鐘保險：圖片端有 180 秒逾時，正常不會撞到這個底線。
        _deferVoicePrewarm: function() {
            const self = this;
            (async () => {
                await new Promise(r => setTimeout(r, 2000));   // 給各圖片預熱把生成單排進來的時間
                const t0 = Date.now();
                let idle = 0;
                while (Date.now() - t0 < 300000) {
                    if (self.imgPendingStatus().pending === 0) { if (++idle >= 3) break; }   // 連續 ~1.5 秒沒單＝清空
                    else idle = 0;
                    await new Promise(r => setTimeout(r, 500));
                }
                self._prewarmSoVITS();
            })();
        },

        /**
         * 獨立版場景插圖：先送副模型分析，拿到增強版文本後再 loadScript + next
         * 若未啟用或非獨立模式，直接走原本流程
         * @param {string}   text      原始劇情文本
         * @param {string|null} msgId  訊息 ID（獨立版通常為 null）
         */
        _loadWithSceneAnalysis: function(text, msgId) {
            // 獨立版場景分析已退役（2026-06-13）：直接載入；場景插圖改走 主模型 [Scene|] tag / 副模型版(接記憶)
            this.loadScript(text, msgId);
            this.next();
        },

        /**
         * 統一啟動程序（2026-06-11）：載入劇本（圖片預熱全開、語音延後）→ 立刻開播。
         * 章節卡片/開場指令照常顯示（卡片就是天然等待室）；
         * 「第一行劇情文本」要渲染時若圖片還沒全好，next() 內建的開場閘門才會彈 loading 攔住。
         */
        _startWithLoader: function(text, msgId) {
            // 獨立版場景分析已退役（2026-06-13）：直接載入開播；場景插圖走 主模型 [Scene|] tag / 副模型版(接記憶)
            this.loadScript(text, msgId);
            this.next();
        },

        /**
         * 顯示 loading bar，滿後執行 onDone（預設啟動 VN）
         * 給外部插件預留注入時間（如圖片生成插件）
         */
        // 確保 loader 殼存在（樣式＋DOM），回傳元素；開場 loading 與「故事撰寫中」幕布共用
        _ensureStartLoaderEl: function() {
            const gamePage = document.getElementById('page-game');
            if (!gamePage) return null;

            if (!document.getElementById('vn-sl-style')) {
                const s = document.createElement('style');
                s.id = 'vn-sl-style';
                s.textContent = '#vn-start-loader{position:absolute;inset:0;z-index:900;background:#050402;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}' +
                    '#vn-start-loader-track{width:60%;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden}' +
                    '#vn-start-loader-bar{height:100%;width:0%;background:#d4af37;border-radius:2px;transition:width linear}' +
                    '#vn-start-loader-label{font-size:10px;letter-spacing:3px;color:rgba(212,175,55,0.5);text-transform:uppercase}' +
                    '#vn-start-loader-skip{display:none;margin-top:6px;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.35);border:1px solid rgba(255,255,255,0.18);border-radius:4px;padding:6px 18px;cursor:pointer;background:transparent}' +
                    '#vn-start-loader-skip:hover{color:rgba(255,255,255,0.7);border-color:rgba(255,255,255,0.4)}';
                document.head.appendChild(s);
            }

            let el = document.getElementById('vn-start-loader');
            if (!el) {
                el = document.createElement('div');
                el.id = 'vn-start-loader';
                el.innerHTML = '<div id="vn-start-loader-track"><div id="vn-start-loader-bar"></div></div><div id="vn-start-loader-label">Loading</div><button id="vn-start-loader-skip" type="button">跳過等待</button>';
                gamePage.appendChild(el);
            }
            return el;
        },

        // 「故事撰寫中」幕布：等 AI 收尾期間蓋住劇情頁（重用 loader 殼；無進度、無跳過）。
        // 劇本落地後開場閘門的 _showStartLoader 會無縫接手換成「圖片繪製中 N/M」。
        _writerCurtain: false,
        _showWriterCurtain: function() {
            const el = this._ensureStartLoaderEl();
            if (!el) return;
            this._writerCurtain = true;
            el.style.display = 'flex';
            const label = el.querySelector('#vn-start-loader-label');
            if (label) label.textContent = '故事撰寫中…';
            const skip = el.querySelector('#vn-start-loader-skip');
            if (skip) skip.style.display = 'none';
            const bar = el.querySelector('#vn-start-loader-bar');
            if (bar) { bar.style.transition = 'width 2000ms linear'; bar.style.width = '15%'; }
        },
        _hideWriterCurtain: function() {
            if (!this._writerCurtain) return;
            this._writerCurtain = false;
            const el = document.getElementById('vn-start-loader');
            if (el) el.style.display = 'none';
        },

        _showStartLoader: function(ms, onDone) {
            const el = this._ensureStartLoaderEl();
            if (!el) { if (onDone) onDone(); return; }
            this._writerCurtain = false;        // 幕布交棒給正式 loading
            el.style.display = 'flex';          // ⚠️ 重用必須重新打開（之前少這行→第二次起永遠隱形）

            const bar = el.querySelector('#vn-start-loader-bar');
            bar.style.transition = 'none';
            bar.style.width = '0%';
            void bar.offsetWidth;
            bar.style.transition = 'width ' + ms + 'ms linear';
            bar.style.width = '100%';

            // 基本進度條跑完後：轉入「等全部圖片」階段（頭像＋背景＋場景＋道具）。
            // 圖片預熱的快取檢查是非同步的，剛開始可能還沒排單 → 用 idle-streak（連續 ~1.5 秒沒單）判定清空，
            // 不能「當下沒單就放行」。顯示真實進度、5 分鐘上限保險、點擊直接跳過（沒好的生完自己浮現）。
            const self = this;
            const skipBtn = el.querySelector('#vn-start-loader-skip');
            const finish = function() {
                el.style.display = 'none';
                if (skipBtn) { skipBtn.style.display = 'none'; skipBtn.onclick = null; }
                if (onDone) onDone();
            };
            setTimeout(function() {
                if (ms === 0) { finish(); return; }   // ms=0 是「只建 DOM、立即隱藏」的舊契約（vn_inspect 用），不進等待階段
                const label = el.querySelector('#vn-start-loader-label');
                const CAP = 300000, t0 = Date.now();
                let closed = false, idle = 0;
                const stop = function() {
                    if (closed) return; closed = true;
                    clearInterval(tick); finish();
                };
                // 跳過＝明確按鈕。整面可點的舊設計會被「VN 玩家手不停點」誤觸秒跳（2026-06-11 實測）
                if (skipBtn) {
                    skipBtn.style.display = 'inline-block';
                    skipBtn.onclick = function(ev) { ev.stopPropagation(); stop(); };
                }
                const tick = setInterval(function() {
                    const s2 = (typeof self.imgPendingStatus === 'function') ? self.imgPendingStatus() : { done: 0, total: 0, pending: 0 };
                    if (s2.total > 0) {
                        if (label) label.textContent = '圖片繪製中 ' + s2.done + '/' + s2.total;
                        bar.style.transition = 'none';
                        bar.style.width = Math.min(100, Math.round(s2.done / Math.max(1, s2.total) * 100)) + '%';
                    } else if (s2.pending > 0 && label) {
                        label.textContent = '整理素材中…';
                    }
                    if (s2.pending === 0) { if (++idle >= 3) stop(); }
                    else idle = 0;
                    if ((Date.now() - t0) > CAP) stop();
                }, 500);
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
        // ── 裸 HTML 美化卡兼容 ─────────────────────────────────────────
        // 有些卡讓 AI 直接在正文吐 <div style=…> 小型展示卡（沒有酒館正則、也不是自訂 tag 區塊）。
        // loadScript 按行切割會把它拆成碎旁白 → 這裡在切割前先掃出「行首起頭、同名標籤配對閉合」的
        // 整塊 HTML，收進 _rawHtmlCards、原位換成一行 [HtmlCard|i]；播放到該行用彈窗展示
        // （顯示時過 DOMPurify 消毒＝純展示不跑 script，AI 直出的卡幾乎都是純樣式）。
        _rawHtmlCards: [],
        _extractRawHtmlCards: function(text) {
            try {
                this._rawHtmlCards = [];
                if (!text || text.indexOf('<') < 0) return text;
                const ROOT = /^<(div|table|section|aside|center|figure|details|blockquote|article)\b[^>]*>/i;
                const lines = String(text).split('\n');
                const out = [];
                for (let i = 0; i < lines.length; i++) {
                    const t = lines[i].trim();
                    const m = t.match(ROOT);
                    if (!m) { out.push(lines[i]); continue; }
                    const tag = m[1].toLowerCase();
                    const openRe = new RegExp('<' + tag + '\\b', 'gi');
                    const closeRe = new RegExp('</' + tag + '\\s*>', 'gi');
                    let depth = 0, j = i;
                    const chunk = [];
                    for (; j < lines.length && j - i < 200; j++) {   // 200 行保險：不平衡就放棄別掃到天邊
                        chunk.push(lines[j]);
                        depth += (lines[j].match(openRe) || []).length;
                        depth -= (lines[j].match(closeRe) || []).length;
                        if (depth <= 0) break;
                    }
                    if (depth > 0) { out.push(lines[i]); continue; }   // 沒配對閉合 → 不當卡、原樣照舊
                    this._rawHtmlCards.push(chunk.join('\n'));
                    out.push('[HtmlCard|' + (this._rawHtmlCards.length - 1) + ']');
                    i = j;
                }
                return out.join('\n');
            } catch (e) { return text; }
        },

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

            // 🔊 組件登場音效：卡片確定要彈出了 → 查該 tag 的模板 appearSfx（沒設就不播）。
            // 音效來源＝素材設定的「音效目錄」(playSFX 走 VN_Config.data.sfx 基底)；留空＝無聲、不預設。
            // 🔤 面板字體槽：同一次查模板順便拿 appearFont，蓋過卡片自帶字體（治繁簡混排有細有粗）。
            // overlay 是重複使用的 → 字體 style 每次彈卡先清再掛，換到沒設字體的組件不殘留。
            try {
                const _oldFont = document.getElementById('vn-dbo-font');
                if (_oldFont) _oldFont.remove();
                if (tagHint) {
                    const _dp = window.VN_DynamicParser;   // ⚠️掛在 VN 播放器自己的 window(非 parent)，全檔一致；用 win 會抓不到
                    const _tpl = _dp && Array.isArray(_dp.activeTemplates)
                        && _dp.activeTemplates.find(t => t.tagId && t.tagId.toLowerCase() === String(tagHint).toLowerCase());
                    if (_tpl && _tpl.appearSfx) this.playSFX(_tpl.appearSfx);
                    if (_tpl && _tpl.appearFont) {
                        const _fs = document.createElement('style');
                        _fs.id = 'vn-dbo-font';
                        _fs.textContent = '#vn-dom-block-body, #vn-dom-block-body *{font-family:' + _tpl.appearFont + ' !important}';
                        document.head.appendChild(_fs);
                    }
                }
            } catch (e) {}

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
                    '#vn-dom-block-close{position:absolute;top:12px;right:14px;z-index:3;width:34px;height:34px;display:none;align-items:center;justify-content:center;color:rgba(232,223,200,0.85);font-size:20px;line-height:1;cursor:pointer;border-radius:50%;background:rgba(0,0,0,0.4)}',
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
                overlay.innerHTML = '<div id="vn-dom-block-close" title="關閉">✕</div><div id="vn-dom-block-body"></div><div id="vn-dom-block-hint">點擊背景關閉</div>';
                // 背景點擊：只有作者裸卡/【】(無自帶關閉鈕)才關；創作室組件(有 tagHint)靠自帶鈕或右上✕，避免手殘誤觸跳過
                overlay.onclick = (e) => { if (e.target === overlay && this._domBlockBgClose) this._hideDomBlock(); };
                const _cxBtn = overlay.querySelector('#vn-dom-block-close');
                if (_cxBtn) _cxBtn.onclick = (e) => { e.stopPropagation(); this._hideDomBlock(); };
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
            // 關閉方式依卡片來源切換：創作室組件(有 tagHint)→背景不關(防手殘誤觸跳過)、顯示右上✕當保底逃生、藏「點擊背景關閉」；
            //   作者裸卡/【】(無 tagHint、無自帶關閉鈕)→維持背景點擊關閉+提示、藏✕。
            this._domBlockBgClose = !tagHint;
            const _cxEl = document.getElementById('vn-dom-block-close');
            if (_cxEl) _cxEl.style.display = tagHint ? 'flex' : 'none';
            const _hintEl2 = document.getElementById('vn-dom-block-hint');
            if (_hintEl2) _hintEl2.style.display = tagHint ? 'none' : '';
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

        // ── 🖼️ 背景/場景CG/道具 AI 生圖管線 → 已拆至 vn_core_images.js（Object.assign 掛回本物件；載入順序必須在本檔之後）──
        //    含：_toDataUrl/_toObjectUrl/testFallback/_setBgImage/_buildFallbackKeywords/_pixabayFallback/_loremFlickrFallback/
        //        _bgGenPrompt/_itemGenPrompt/_safeFetchBg/_doFetchBg/_preloadImg/_isDynBlockTag/_linesOutsideDynBlocks/
        //        _hoistSceneDirectivesFromDynBlocks/_prewarmBgs/_prewarmItems/_safeFetchItem/_doFetchItem/_parseSceneBlock/
        //        _prewarmScenes/_saveSceneToDisk/_safeFetchScene/retrySceneCg/_setSceneCgFailed/_doFetchScene

        _prewarmAvatars: function() {
            // ⭐ 不再因 spriteBase 整批跳過（靜態立繪只是 fallback 第一層）；改為下方逐角色探靜態圖、缺的才生。
            const names = Object.keys(this.avatars);
            // 把 persona 名字也納入預熱
            try {
                const uName = win.OS_PERSONA?.getName?.() || win.OS_API?.getGlobalUserName?.();
                if (uName && !this.avatars[uName] && !names.includes(uName)) names.push(uName);
            } catch(e) {}
            if (!names.length) return;

            (async () => {
                this._imgScanStart();   // 盤點階段也算忙碌：讀世界書/逐一查 IDB 期間沒有生成單，別讓 loading 誤判完成
                try {
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
                    // 自備靜態立繪/預設圖存在 → 播放時直接讀，不必生
                    if (await this._staticAvatarExists(name)) { console.log(`[VN] 頭像使用自備靜態圖：${name}`); continue; }
                    if (win.OS_IMAGE_MANAGER) needGen.push(name);
                }

                if (!needGen.length) { console.log('[VN] 所有頭像預熱完成（全部快取命中）'); return; }

                // 第二輪：生成。雲端(NAI/Poll)維持並行；本機(ComfyUI直連/酒館SD)改串行——
                // ComfyUI 端本來就一張一張跑，串行零損失，還讓「語音紅綠燈」插得進空檔
                const _svc = (typeof win.OS_IMAGE_MANAGER?.serviceFor === 'function') ? win.OS_IMAGE_MANAGER.serviceFor('char') : (win.OS_IMAGE_MANAGER?.config?.service || '');
                const _localGpu = (_svc === 'comfyui_direct' || _svc === 'tavern_sd');
                console.log(`[VN] ${_localGpu ? '串行' : '並行'}生成 ${needGen.length} 個頭像...`);
                if (_localGpu) {
                    for (const name of needGen) { await this._genAvatarToCache(name); }
                } else {
                    await Promise.all(needGen.map(name => this._genAvatarToCache(name)));
                }
                console.log('[VN] 所有頭像預熱完成');
                } finally { this._imgScanEnd(); }
            })();
        },

        // ── 頭像生成共用管線（loadScript 預熱 / 早鳥監聽 共用；立繪模式也走這條，只在 _makeCharImage 換生成）──
        // in-flight 去重：同名頭像不論從哪條路觸發，同時只生一張（頭像/立繪共用此管線）
        _avatarInflight: {},
        // ── 圖片預熱總進度（頭像＋背景＋場景CG＋道具全算；開場 loading 與語音延後都看這個）──
        // scanning＝「盤點中」：預熱在讀世界書/查快取、還沒把生成單排進來的階段。
        // 沒有它會有盤點空窗（inflight=0 但工作沒做完）→ loading 誤判完成提早放行（2026-06-11 實測踩過）
        _imgJobs: { done: 0, total: 0, inflight: 0, scanning: 0 },
        _imgJobStart: function() {
            const j = this._imgJobs;
            if (!j.inflight && j.done >= j.total) { j.done = 0; j.total = 0; }   // 上一批清空 → 進度歸零重計
            j.total++; j.inflight++;
        },
        _imgJobEnd: function() { const j = this._imgJobs; j.inflight = Math.max(0, j.inflight - 1); j.done++; },
        _imgScanStart: function() { this._imgJobs.scanning++; },
        _imgScanEnd: function() { const j = this._imgJobs; j.scanning = Math.max(0, j.scanning - 1); },
        imgPendingStatus: function() {
            const j = this._imgJobs;
            return { done: j.done, total: j.total, pending: j.inflight + j.scanning };
        },
        avatarPendingStatus: function() { return this.imgPendingStatus(); },   // 舊名相容
        // 快取不分頭像/立繪模式＝刻意設計（Rae 2026-07-07 拍板）：切拉桿不重生舊圖、不燒額度——
        // 舊頭像照用，要立繪她自己按 studio「一鍵生立繪」。真正的「開了拉桿還生頭像」bug 是
        // VN_Config.load 時序（vn_config.js 已自讀修掉），別再往快取加模式判定。
        _genAvatarToCache: function(name) {
            if (this._avatarMemCache[name]) return Promise.resolve(this._avatarMemCache[name]);
            if (this._avatarInflight[name]) return this._avatarInflight[name];
            if (this._pendingAvatars[name]) return this._pendingAvatars[name];   // 晚路徑（開口時）正在生這張 → 等它、別重發（雙向去重，本機 GPU 不排兩次）
            const self = this;
            const job = (async () => {
                try {
                    let d = self._resolveAvatarPrompt(name);
                    // none 路人（有聲線無外觀）：只有立繪模式才合成 prompt 生全身；一般頭像模式維持剪影不生成
                    if (!d && VN_Config.data.spriteDirect === true && self._isNoneChar(name)) d = await self._buildNonePrompt(name);
                    if (!d) return '';   // 沒外觀（含 none 非立繪模式）→ 絕不用空 prompt 生圖（會出裸圖），交給剪影
                    const img = await self._makeCharImage(d, 'Neutral');   // 立繪模式由 _makeCharImage 內部換立繪 prompt + 去背
                    if (!img) { console.warn(`[VN] 角色圖生成失敗：${name}`); return ''; }
                    self._avatarMemCache[name] = img.objUrl;
                    // 單一 avatar_cache（切拉桿不重生舊圖＝Rae 拍板，別再往快取加模式判定）；spriteDirect 生的是立繪→只加 isSprite 標記供相簿分類，不換 store
                    if (img.dataUrl) { try { await VN_Cache.set('avatar_cache', name, VN_Config.data.spriteDirect === true ? { prompt: d, url: img.dataUrl, isSprite: true } : { prompt: d, url: img.dataUrl }); } catch(e) {} }
                    console.log(`[VN] 角色圖生成完成：${name}`);
                    return img.objUrl;
                } catch(e) { console.warn(`[VN] 角色圖生成例外：${name}`, e); return ''; }
            })();
            this._avatarInflight[name] = job;
            this._imgJobStart();
            job.finally(() => { delete self._avatarInflight[name]; self._imgJobEnd(); });
            return job;
        },

        // ── 生成「一張角色圖」的共用咽喉（頭像 or 立繪，看 spriteDirect）──
        //   立繪模式＝唯二差別：① getSprite 模板取代 getAvatar ② AI 去背。整條 gate/解析/快取/去重由呼叫端
        //   (頭像管線：_genAvatarToCache / fallbackToAI) 共用，這裡只負責「生成那一步」。回 { objUrl, dataUrl }，失敗回 null。
        _makeCharImage: async function(prompt, exp) {
            const sprite = (VN_Config.data.spriteDirect === true);
            const raw = await (sprite ? VN_Image.getSprite(prompt) : VN_Image.getAvatar(prompt, exp));
            if (!raw) return null;
            let blob = null;
            try { blob = await (await fetch(raw)).blob(); }
            catch (e) { try { const du = await this._toDataUrl(raw); if (du) blob = await (await fetch(du)).blob(); } catch (e2) {} }
            if (!blob) { const du = await this._toDataUrl(raw); return du ? { objUrl: du, dataUrl: du } : null; }
            if (sprite) {   // 立繪去背：跟典籍「一鍵生立繪」同款，直接 AI 去背(isnet，吃任何背景)；失敗退原圖
                // （舊版先跑純色 flood-fill 求快，但容差會滲進淺色角色把中心挖破 → 已砍，全走 AI）
                let cut = null;
                try { cut = await this._stripSpriteBgAI(blob); } catch (e) {}
                if (cut) blob = cut;
                else console.warn('[VN] ⚠️ 立繪去背失敗 → 先用帶背景原圖上台。若立繪總是沒去背，往上找「AI 去背失敗」的錯誤原因（多半是去背模型下載不了）');
            }
            const objUrl = URL.createObjectURL(blob);
            let dataUrl = '';
            try { dataUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.onerror = () => r(''); rd.readAsDataURL(blob); }); } catch (e) {}
            return { objUrl, dataUrl };
        },

        // 🤖 AI 去背（@imgly isnet，靠 AI 認人形、吃任何背景）：立繪模式唯一去背路徑（同典籍「一鍵生立繪」）。
        //   首次下載 ~40MB 模型(之後快取)、單張 ~10–30 秒(WASM 單執行緒)。模型函式快取在 _bgRemoverFn。失敗回 null。
        _bgRemoverFn: null,
        _bgRemoveChain: Promise.resolve(),   // 去背序列化鏈（同 NAI _naiQueue 思路）：WASM 單執行緒，全程一張一張跑
        _stripSpriteBgAI: function(blob) {
            // ⚠️ WASM 去背是單執行緒 / CPU-bound，並行只會互搶 CPU + 吃爆記憶體 → 用 promise 鏈強制串行：
            //   不管上游生成是並行(Pollinations)還是串行，去背永遠一張跑完才下一張；模型只載一次。
            const self = this;
            const run = async () => {
                try {
                    if (!self._bgRemoverFn) {
                        const m = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
                        self._bgRemoverFn = m.removeBackground;
                    }
                    return await self._bgRemoverFn(blob, { model: 'isnet_fp16', output: { format: 'image/png', quality: 1.0 } });
                } catch (e) { console.warn('[VN] AI 去背失敗:', e?.message || e); return null; }
            };
            const next = self._bgRemoveChain.then(run, run);   // 前一個成敗都接著跑
            self._bgRemoveChain = next.catch(() => {});          // 鏈不因單張失敗而斷
            return next;
        },

        // ── 早鳥入口：搶在 VN 載入前提早登記＋生成頭像＋背景（vn_avatar_earlybird / 面板啟動路呼叫）──
        // 從任意文本掃 [Avatar|名|描述] 與 [Bg|...]。★序列化、不併發：先頭像(逐位)、再背景(逐張)，全程 await 串接。
        //   順序「頭像先」是不回退頭像時序；背景之後接上，仍比純惰性早、且 loadScript 預熱仍墊底。
        earlybirdFromText: async function(text) {
            try {
                if (!text) return;
                // 1) 頭像（[Avatar|名|外觀] 或 [Avatar|名|聲線|外觀]；外觀取最後段，聲線存 charVoices）
                const pairs = [];
                const reAv = /^\s*\[Avatar\|([^|\]\n]+)\|([^\]\n]+)\]\s*$/gmi;
                let m;
                while ((m = reAv.exec(text)) !== null) {
                    const n = m[1].trim();
                    const rest = m[2].split('|').map(s => s.trim());
                    let d = '';
                    if (rest.length >= 2) { if (rest[0]) this.charVoices[n] = rest[0]; d = rest.slice(1).join(' '); }
                    else { d = rest[0]; }
                    if (n && d && !pairs.some(p => p.name === n)) pairs.push({ name: n, desc: d });
                }
                if (pairs.length) {
                    console.log(`[VN] 頭像早鳥：收到 ${pairs.length} 位（${pairs.map(p => p.name).join('、')}）`);
                    await this._earlybirdAvatars(pairs);
                }
                // 2) 背景（接在頭像後，逐張序列，與頭像不併發）— 解析對齊 _prewarmBgs：cacheId=parts[1]、_bgGenPrompt
                const bgs = [];
                const seen = new Set();
                const reBg = /\[Bg\|([^\]\n]*)\]/g;
                while ((m = reBg.exec(text)) !== null) {
                    const parts = m[1].split('|');
                    const cacheId = parts[1];
                    const prompt = this._bgGenPrompt(parts);
                    if (!cacheId || !prompt || seen.has(cacheId)) continue;
                    seen.add(cacheId);
                    bgs.push({ cacheId, prompt });
                }
                if (bgs.length) {
                    console.log(`[VN] 背景早鳥：收到 ${bgs.length} 張（${bgs.map(b => b.cacheId).join('、')}）`);
                    await this._earlybirdBgs(bgs);
                }
            } catch(e) {}
        },
        // 背景早鳥：逐張序列生成（不併發），走 _safeFetchBg 與現場/預熱共用 _bgInflight 去重，登場直接讀
        _earlybirdBgs: async function(tasks) {
            if (!tasks || !tasks.length) return;
            if (!this._imgEngineReady()) {
                const _ok = await this._waitForImageManager(180000);
                if (!_ok) return;
            }
            this._imgScanStart();
            try {
                for (const { cacheId, prompt } of tasks) {
                    if (this._bgMemCache[cacheId] || this._bgInflight[cacheId] || this._bgFailed[cacheId]) continue;
                    console.log(`[VN] 背景早鳥：${cacheId} → 提前生成`);
                    this._imgJobStart();
                    try { await this._safeFetchBg(cacheId, prompt); } finally { this._imgJobEnd(); }
                }
            } finally { this._imgScanEnd(); }
        },
        // 生圖引擎就緒判定：vn_core 的 win=window.parent，但再注入時序下 OS_IMAGE_MANAGER 可能先掛在
        // window 或 window.parent。任一個有就算就緒——實際生成走 VN_Image.getAvatar，會用對的那個 win。
        _imgEngineReady: function() {
            try { if (win && win.OS_IMAGE_MANAGER) return true; } catch(e) {}
            try { if (window.OS_IMAGE_MANAGER) return true; } catch(e) {}
            try { if (window.parent && window.parent.OS_IMAGE_MANAGER) return true; } catch(e) {}
            return false;
        },
        _waitForImageManager: function(timeoutMs) {
            const self = this;
            if (self._imgEngineReady()) return Promise.resolve(true);
            return new Promise(function(resolve) {
                const t0 = Date.now();
                const iv = setInterval(function() {
                    if (self._imgEngineReady()) { clearInterval(iv); resolve(true); }
                    else if (Date.now() - t0 > (timeoutMs || 180000)) { clearInterval(iv); resolve(false); }
                }, 400);
            });
        },
        // 探「使用者自備的靜態立繪/預設圖」在不在（對齊 _renderSlot/handleImgError 的 fallback 鏈：spriteBase→charDefaultBase）。
        // 在＝播放時直接讀靜態檔、不用生；不在（AI 臨時編的 NPC）＝該角色 fallback 會走到「生成」，早鳥/預熱要提前生。
        _staticAvatarExists: function(name) {
            const urls = [];
            if (VN_Config.data.spriteBase) this._nameVariants(name).forEach(v => urls.push(`${VN_Config.data.spriteBase}${v}_Neutral.png`));
            if (VN_Config.data.charDefaultBase) this._nameVariants(name).forEach(v => urls.push(`${VN_Config.data.charDefaultBase}${v}_presets.png`));
            if (!urls.length) return Promise.resolve(false);
            return new Promise(resolve => {
                let i = 0;
                (function probe() {
                    if (i >= urls.length) return resolve(false);
                    const url = urls[i++];
                    const im = new Image();
                    let settled = false;
                    const to = setTimeout(() => { if (!settled) { settled = true; probe(); } }, 5000);
                    im.onload  = () => { if (!settled) { settled = true; clearTimeout(to); resolve(true); } };
                    im.onerror = () => { if (!settled) { settled = true; clearTimeout(to); probe(); } };
                    im.src = url;
                })();
            });
        },
        _earlybirdAvatars: async function(pairs) {
            if (!pairs || !pairs.length) return;
            // ⭐ 不再因 spriteBase 就整批跳過：靜態立繪只是 fallback 第一層，沒自備圖的角色（AI 臨時 NPC）
            //    最終會走到「生成」那層 → 必須提前生，否則登場才生＝卡 3-4 秒。改為逐角色探靜態圖在不在。
            // ⭐ 引擎就緒走 _imgEngineReady（win/window/window.parent 任一），避免 iframe 跨-win 落差整批丟。
            if (!this._imgEngineReady()) {
                const _ok = await this._waitForImageManager(180000);
                if (!_ok) { console.warn('[VN] 頭像早鳥：等 OS_IMAGE_MANAGER 逾時，放棄預生（退回對話時生成）'); return; }
            }
            this._imgScanStart();   // 整批處理期間舉「忙碌」牌：查快取的空檔不算完成
            try {
            for (const p of pairs) {
                const name = p.name, desc = p.desc;
                if (!name || !desc) continue;
                if (!this.avatars[name]) this.avatars[name] = desc;   // 先登記，loadScript 再解析到也只是覆寫同值
                if (this._avatarMemCache[name] || this._avatarInflight[name]) continue;
                try {
                    // 與預熱第一輪同序的快速快取檢查：世界書素材 → IDB → persona URL，命中就不生
                    if (!this._lorebookLoaded) { await this._loadLorebookAvatars(); this._lorebookLoaded = true; }
                    const lbUrl = this._lorebookAvatarCache[name] || this._lorebookAvatarCache[this._nameVariants(name).find(v => this._lorebookAvatarCache[v])];
                    if (lbUrl) continue;
                    const cached = await VN_Cache.get('avatar_cache', name);
                    if (cached?.url && !cached.url.startsWith('blob:')) continue;
                    if (this._getPersonaFallback(name)?.url) continue;
                    // 自備靜態立繪/預設圖存在 → 播放時直接讀靜態檔，不用生
                    if (await this._staticAvatarExists(name)) { console.log(`[VN] 頭像早鳥：${name} 有自備靜態圖，跳過生成`); continue; }
                } catch(e) {}
                // 串行生成（≤10 張；本機讓路交給語音紅綠燈在生圖層處理）
                console.log(`[VN] 頭像早鳥：${name} 無現成來源 → 提前生成`);
                await this._genAvatarToCache(name);
            }
            } finally { this._imgScanEnd(); }
        },

        handlePanelClick: function() { if (this.isSkip) this.toggleSkip(); this.next(); },

        playSFX: function(sfxId) {
            // ⚡ fx- 開頭 = 畫面特效（AI 偶爾會塞進尾格 SFX 欄）→ 轉交 OS_FX，別當音效檔去 404
            if (sfxId && /^fx-/i.test(String(sfxId).trim())) {
                try { if (window.OS_FX) window.OS_FX.play(String(sfxId).trim()); } catch (e) {}
                return;
            }
            // 「兩格狀態」制（Rae 設計）：音效活過「自己那格＋下一格」，第二次推進才收。
            // 快速點字不掐頭（舊版每行推進都先 stopSFX＝音效總死在開頭）；也不放任沒切片的長音效裸奔（5 秒上限仍是天花板）。
            if (!sfxId || sfxId === 'NA' || sfxId.trim() === '') {
                if (this._currentSfxAudio && --this._sfxLives <= 0) this.stopSFX();   // 沒音效的行＝過一格、扣一條命
                return;
            }

            // 切換新音效前，確保先停止上一個音效避免重疊
            this.stopSFX();
            this._sfxLives = 2;   // 自己那格 + 下一格
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

        // 🎲 表情格容錯（自由模式常駐）：[Char|名|「台詞」|Stay] 三欄制沒有表情格——
        //   表情恆為純英文字，第二格不是純英文字＝它其實是台詞 → 補 Neutral 佔位，三欄四欄都吃。
        //   固定模式下 AI 偶爾漏寫表情也順便救（不再整行死掉）。
        _normCharParts: function(p) {
            if (p.length >= 2 && !/^[A-Za-z]+$/.test(String(p[1] || '').trim())) p.splice(1, 0, 'Neutral');
            return p;
        },

        _extractTextAndSFX: function(parts) {
            // 第五欄「站位狀態」Stay/Leave（強制欄、schema 恆定）：最先抽走——所有 [Char] 消費端
            //（顯示/TTS/日誌/通話字幕）都經過這裡，集中剝除就全鏈乾淨；四欄舊行沒這欄=stage:''，完全相容。
            let stage = '';
            if (parts.length > 1) {
                const lp = parts[parts.length - 1].trim().toLowerCase();
                if (lp === 'stay' || lp === 'leave') { stage = lp; parts.pop(); }
            }
            let sfx = 'NA';
            if (parts.length > 1) {
                let lastPart = parts[parts.length - 1].trim();
                if (/^[a-zA-Z0-9_\-&]+$/.test(lastPart)) {
                    sfx = parts.pop().trim();
                }
            }
            return { text: parts.join('|'), sfx: sfx, stage: stage };
        },
        // 正文內穿插的 #SFXID# 音效標記（旁白不帶 Nar 後的新格式）：抽出第一個當音效、其餘標記一律從顯示文字剝掉。
        //   回 { text: 去標記後的文字, sfx: 第一個ID或'NA' }。與 tag 尾格 SFX 並存(呼叫端 inline 優先、沒有才用尾格)。
        _extractInlineSFX: function(text) {
            if (!text || text.indexOf('#') === -1) return { text: text || '', sfx: 'NA' };
            let sfx = 'NA';
            const cleaned = String(text).replace(/#([A-Za-z0-9_\-&]+)#/g, (_m, id) => {
                const _id = id.trim();
                if (/^fx-/i.test(_id)) {   // ⚡ fx- 開頭 = 畫面特效標記 → 交 OS_FX 播，不當音效
                    try { if (window.OS_FX) window.OS_FX.play(_id); } catch (e) {}
                    return '';
                }
                if (sfx === 'NA') sfx = _id;   // 一行取第一個(playSFX 一次一個、後者會蓋前者)
                return '';
            }).replace(/[ \t]{2,}/g, ' ').replace(/\s+([，。、！？,.!?])/g, '$1').trim();
            return { text: cleaned, sfx: sfx };
        },
        // 純剝除 #SFXID# 標記（給歷史/日誌/酒館顯示用，不觸發音效）
        _stripInlineSFX: function(text) {
            return String(text || '').replace(/#[A-Za-z0-9_\-&]+#/g, '').replace(/[ \t]{2,}/g, ' ').trim();
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
                // 聲線已搬到 [Avatar]：[Char] 沒帶就用 Avatar 宣告的固定聲線（隨機 NPC 才在 [Char] 自帶）
                if (!typeHint) typeHint = this.charVoices[charName] || '';

                if (!text || (VN_TTS._resolveModel && !VN_TTS._resolveModel(charName, typeHint))) continue;
                lines.push({ charName, text, emotion: this._mapExprToEmotion(rawExp), typeHint });
            }
            if (lines.length) {
                VN_TTS.prewarm(lines);
                console.log(`[VN] VN_TTS 預生成：${lines.length} 條語音排入佇列`);
            }
        },

        // 台詞欄被 AI 混進旁白（「話」他動了動「話」）→ 語音只念「」內的內容，旁白描述不出聲（防出戲）。
        // 沒有「」的整句照舊（內心話 *…*、純口語、旁白走自己的路都不受影響）；多段引號用空格串接（TTS 自然停頓）。
        _speechOnly: function(text) {
            const s = String(text || '');
            const m = s.match(/「[^「」]*」/g);
            if (!m || !m.length) return s;
            const joined = m.map(seg => seg.slice(1, -1).trim()).filter(Boolean).join(' ');
            return joined || s;
        },

        // 送 GPT-SoVITS 前清理文字：去掉開頭與結尾標點，避免後端切句異常與靜音
        _cleanTextForSoVITS: function(text) {
            if (!text) return '';
            // 語音壓到「」內（有引號才作用）——播放/系統音/預熱全走這裡 → 快取 key 自動對齊
            let cleaned = this._speechOnly(text);
            // 再剝掉 ()（）內的動作/語氣描述（如「(輕笑)」）——那是舞台指示，不該被念出來。
            //   MiniMax 端 cleanTextForTts 已有剝；SoVITS 這條原本漏了 → 跟 VN-phone 語音對齊。
            cleaned = String(cleaned).replace(/[（(][^（()]*[)）]/g, ' ');
            cleaned = cleaned.replace(/^[。，、…‥「」『』【】〔〕！？!?,\s]+/, '');
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

        // 旁白語音播放 — Kokoro 開了走 Kokoro、否則 SoVITS 旁白音色；playNarration 自己把關，故不綁 SoVITS 開關
        // ⚠️ 不在這裡套 _cleanTextForSoVITS（會拔逗號）；傳原文給引擎各自清 —— Kokoro 要保留標點才有停頓
        _vnNarrVoicePlay: function(rawText) {
            const VN_TTS = (window.parent || window).VN_TTS;
            if (typeof VN_TTS?.playNarration !== 'function') return;
            if (!rawText || !String(rawText).trim()) return;
            VN_TTS.playNarration(rawText);
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
                    // CTX 彈窗現在是 #page-game 直屬置中 modal、對話/末尾共用 → 末尾直接 toggle，不再搬元素/浮右上
                    const ctxBtn = document.getElementById('vn-end-btn-ctx');
                    if (ctxBtn) ctxBtn.onclick = () => { window.VN_Core.toggleCtx(); };
                    // 日誌/地圖：開手機 app。手機殼 panel z-index:50 < VN 全螢幕層 51 →
                    //   直接開會被 VN 蓋在底下看不到，故把 panel 臨時頂到 VN 之上，關閉(goHome)時還原。
                    const _openPhoneAppAboveVN = (appKey) => {
                        const cc = win.AureliaControlCenter || window.AureliaControlCenter;
                        if (!(cc && typeof cc.launchGameApp === 'function')) { console.warn('[VN_Core] 找不到 AureliaControlCenter.launchGameApp（' + appKey + '）'); return; }
                        cc.launchGameApp(appKey);
                        const panel = document.getElementById('aurelia-panel-container');
                        if (panel) {
                            const prevZ = panel.style.zIndex;
                            panel.style.zIndex = '1002';   // 蓋過 VN 全螢幕層(51)
                            // VN 沉浸模式藏了大廳頂欄 → 面板上緣會空一條；開 app 期間還原頂欄（跟大廳開 app 同畫面）
                            const hdr = document.querySelector('.void-top-bar');
                            const hdrWasHidden = !!(hdr && hdr.style.display === 'none');
                            if (hdrWasHidden) hdr.style.display = '';
                            // 關閉偵測用面板 display 變化：返回鍵被 launchGameApp 的攔截器直接 doClose、不經 goHome，
                            // 掛 goHome 會漏——observer 兩條關閉路徑都蓋得到，觸發即自拆（不累積）
                            const ob = new MutationObserver(() => {
                                if (panel.style.display === 'none') {
                                    if (hdrWasHidden && hdr) hdr.style.display = 'none';   // 回 VN 沉浸
                                    panel.style.zIndex = prevZ || '';
                                    ob.disconnect();
                                }
                            });
                            ob.observe(panel, { attributes: true, attributeFilter: ['style'] });
                        }
                    };
                    const jrnlBtn = document.getElementById('vn-end-btn-journal');
                    if (jrnlBtn) jrnlBtn.onclick = () => _openPhoneAppAboveVN('journal');
                    // 🗺️ 地圖：劇情末尾直接開地圖面板看當前世界（探索/排程/小地圖都在裡面）
                    const mapBtn = document.getElementById('vn-end-btn-map');
                    if (mapBtn) mapBtn.onclick = () => _openPhoneAppAboveVN('map');
                }
                return;
            }

            this.index++;
            const line = this.script[this.index];

            // 站位狀態 |Leave 的延後離場：上一句標了 Leave 的角色，玩家點過那句後(=走到這行時)才移除立繪
            //（跟 [Exit] 分開行的節奏一致——告別台詞顯示期間人還在，推進才走）
            if (this._pendingLeave && this._pendingLeave.length) {
                const _pl = this._pendingLeave; this._pendingLeave = [];
                _pl.forEach(n => { try { this._stageRemove(n); } catch (e) {} });
            }

            // ── 開場圖片閘門（loading 排最前面）──────────────────────────────
            // loadScript 後的第一次 next() 就檢查：圖片（含盤點中）沒清空 → 先彈 loading 等，
            // 什麼都不演（BGM/卡片都壓在後面）；圖全好才放劇本開跑 → 章節卡片出場時一切就緒，
            // 「開始閱讀」一點即進劇情零等待。圖好了或按「跳過等待」→ 解除閘門，整章不再檢查。
            if (this._startImgGate) {
                const _st = (typeof this.imgPendingStatus === 'function') ? this.imgPendingStatus() : { pending: 0 };
                if (_st.pending > 0) {
                    this.index--;   // 退回這行，放行後重新走到
                    const self = this;
                    this._showStartLoader(300, function () { self._startImgGate = false; self.next(); });
                    return;
                }
                this._startImgGate = false;
                this._hideWriterCurtain();   // 沒圖可等：把「故事撰寫中」幕布收掉直接開演
            }

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
                // 收集 block 內所有行，交給 _parseSceneBlock（剔 // 注釋、抽可選 scene-id: 首部）
                const _raw = [];
                let _si = this.index + 1;
                while (_si < this.script.length && this.script[_si] !== '</scene>') { _raw.push(this.script[_si]); _si++; }
                this.index = _si; // 停在 </scene>
                const { cacheId: _cacheId, prompt: _scenePrompt } = this._parseSceneBlock(_raw);
                if (_scenePrompt) {
                    const _overlay = document.getElementById('scene-cg-overlay');
                    const _cgImg   = document.getElementById('scene-cg-img');
                    if (_overlay && _cgImg) {
                        _overlay.classList.add('active');
                        this._sceneCgLinger = 3;   // 鋪底式：劇情在上面走、停 3 句對話後自動淡出（不藏對話框、不擋流程）
                        this._sceneCgCur = { cacheId: _cacheId, prompt: _scenePrompt };  // 給 🔄 重生鈕
                        const _memUrl  = this._sceneMemCache[_cacheId];
                        if (_memUrl) { _cgImg.src = _memUrl; this._setSceneCgFailed(false); }
                        else {
                            _cgImg.src = '';
                            (async () => {
                                const url = await this._safeFetchScene(_cacheId, _scenePrompt);
                                if (url && _cgImg) { _cgImg.src = url; this._setSceneCgFailed(false); }
                                else { this._setSceneCgFailed(true); }   // 429/失敗 → 留佔位卡＋重生鈕、不淡出
                            })();
                        }
                    }
                }
                this.next(); return; // 不擋流程：插圖鋪著、劇情繼續往下走
            }
            if (line === '</scene>') { this.next(); return; }

            // ── AI 偶爾把地圖引擎的 SceneMap 誤吐進 VN 正文（且常開閉標籤混用 [SceneMap]…</SceneMap>）──
            //    它不是 VN 內容、也不該當卡片 → 整塊跳過(容忍兩種閉合)、繼續播，別卡死/提早結束劇情
            if (line === '[SceneMap]' || line === '<SceneMap>') {
                let _smi = this.index + 1;
                while (_smi < this.script.length && this.script[_smi] !== '</SceneMap>' && this.script[_smi] !== '[/SceneMap]') _smi++;
                if (_smi < this.script.length) this.index = _smi;   // 找到閉合→跳到閉合行整塊略過；找不到→只跳過 opener 這行，不吃光劇本
                this.next(); return;
            }

            // 🔥 【動態積木攔截 - 最優先，必須在 DOM block 過濾之前】
            if (window.VN_DynamicParser && window.VN_DynamicParser.processLine(line, this)) {
                return;
            }

            // 裸 HTML 美化卡（loadScript 前置掃描收走的整塊）→ 消毒後彈窗展示
            if (line.startsWith('[HtmlCard|')) {
                const _ci = parseInt(line.slice(10), 10);
                const _rawCard = (this._rawHtmlCards || [])[_ci] || '';
                if (!_rawCard) { this.next(); return; }
                let _cleanCard = _rawCard;
                try {
                    const _DP = (win && win.DOMPurify) || window.DOMPurify;
                    if (_DP && _DP.sanitize) _cleanCard = _DP.sanitize(_rawCard);
                    else _cleanCard = _rawCard.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');   // 沒 DOMPurify 的保底消毒
                } catch (e) {}
                this._showDomBlock(null, null, _cleanCard);
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
                    if (_ei >= this.script.length) { this.next(); return; }   // 找不到閉合 → 別把 index 推到劇本末(會害劇情提早結束)，跳過 opener 這行繼續
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
                    if (_ei >= this.script.length) { this.next(); return; }   // 找不到閉合 → 別把 index 推到劇本末(會害劇情提早結束)，跳過 opener 這行繼續
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
                    const memUrl = this._sceneMemCache[cacheId];
                    if (memUrl) {
                        overlay.classList.add('active');
                        this._sceneCgLinger = 3;   // 鋪底式：劇情在上面走、停 3 句對話後自動淡出
                        this._sceneCgCur = { cacheId, prompt };  // 給 🔄 重生鈕
                        cgImg.src = memUrl; this._setSceneCgFailed(false);
                    } else if (cacheId && prompt) {
                        overlay.classList.add('active');
                        this._sceneCgLinger = 3;
                        this._sceneCgCur = { cacheId, prompt };
                        cgImg.src = '';
                        (async () => {
                            const url = await this._safeFetchScene(cacheId, prompt);
                            if (url && cgImg) { cgImg.src = url; this._setSceneCgFailed(false); }
                            else { this._setSceneCgFailed(true); }   // 429/失敗 → 留佔位卡＋重生鈕、不淡出
                        })();
                    } else if (cacheId) {
                        // ID-only [Scene|cacheId]（寫回正文的持久化標籤）：只對相簿(scene_cache)撈圖。
                        // 相簿沒有（被刪/AI 幻造假 ID）→ 靜默跳過：不開 overlay、不佔位、
                        // 也不走 _safeFetchScene 失敗路（那會觸發全域生圖退避，冤枉擋掉本輪真生圖）。
                        (async () => {
                            const cached = await VN_Cache.get('scene_cache', cacheId);
                            if (!cached || !cached.url) { console.log('[VN] [Scene|' + cacheId + '] 相簿沒有這張 → 跳過'); return; }
                            const url = await this._safeFetchScene(cacheId, cached.prompt || '');   // 相簿有圖=必命中，只做 objUrl 轉換
                            if (url && cgImg) {
                                overlay.classList.add('active');
                                this._sceneCgLinger = 3;
                                this._sceneCgCur = { cacheId, prompt: cached.prompt || '' };   // 重生鈕用相簿存的 prompt
                                cgImg.src = url; this._setSceneCgFailed(false);
                            }
                        })();
                    }
                }
                this.next(); return;
            }

            if (line.startsWith('[Bg|')) {
                this._stageClear();   // 換背景＝換場景 → 清空兩格立繪
                try { if (window.OS_FX) window.OS_FX.sceneChange(); } catch (e) {}   // ⚡ 換場 → 持續型天氣特效跟著停

                try { if (win.VN_Phone && win.VN_Phone.currentCallKey) win.VN_Phone.currentCallKey = ''; } catch (e) {}   // 換場景＝通話脈絡結束 → 之後同人來電正常響鈴(非續接)
                const parts = line.slice(4, -1).split('|');
                const sceneLabel = parts.length >= 2 ? parts[1] : parts[0];
                const aiPrompt   = this._bgGenPrompt(parts);   // 第二格(设施名) + 第三格(描述)
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
                    const memUrl = this._bgMemCache[cacheId];
                    const _gameBg = document.getElementById('game-bg');
                    if (memUrl) {
                        this._lastBgCacheId = cacheId;   // 有現成圖 → 更新「最後可用背景」
                        this._setBgImage(_gameBg, memUrl);
                    } else {
                        (async () => {
                            const url = await this._safeFetchBg(cacheId, aiPrompt);
                            // ★只有真的拿到圖才更新 _lastBgCacheId；生成失敗/逾時(url='')→保留上一個可用背景，
                            //   下次 resetState 還原它（治「漏Bg時背景變空」：失敗的 cacheId 指向空 IDB 槽 → 撈空變黑）
                            if (url) { this._lastBgCacheId = cacheId; this._setBgImage(_gameBg, url); }
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
                if (win.OS_ACHIEVEMENT?.unlock) win.OS_ACHIEVEMENT.unlock(emotion, name, desc);
                // VN 內舊的成就 overlay 貼紙已移除（展示改由 VN 組件卡片負責）；這裡只記錄+繼續，不顯示、不卡劇情。
                this.next(); return;
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
                try { if (win.VN_Phone && win.VN_Phone.currentCallKey) win.VN_Phone.currentCallKey = ''; } catch (e) {}   // 過場(時間/場景/視角轉換)＝通話脈絡結束 → 之後同人來電正常響鈴
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
                        // 走 _safeFetchItem：預熱還在生同一張時共用同一個 promise，不再重複生成
                        const url = await this._safeFetchItem(itemName, parts[1] || '');
                        if (url) document.getElementById('item-img').src = url;
                    })();
                }
                this.addLog("獲得物品", `${itemName} - ${parts[1]||''}`);
                return;
            }

            // 🎭 這是你最關心的核心：拆解 Type 和 Expression，然後呼叫對應系統
            if (line.startsWith('[Char|')) {
                const p = this._normCharParts(line.slice(6, -1).split('|'));
                const ex = this._extractTextAndSFX(p.slice(2));
                const _cx = this._extractInlineSFX(ex.text);   // 正文內 #SFXID# → 抽音效 + 剝標記
                if (!_cx.text) { this.playSFX(_cx.sfx !== 'NA' ? _cx.sfx : ex.sfx); return this.next(); }   // 只剩音效→跳過空對話泡

                // 拆解 Type 與 Expression
                let rawExp = p[1] || '';
                let typeHint = '';
                if (rawExp.includes('_')) {
                    const _pts = rawExp.split('_');
                    typeHint = _pts[0].trim();
                    rawExp = _pts.slice(1).join('_').trim();
                }
                // 聲線已搬到 [Avatar]：[Char] 沒帶就用 Avatar 宣告的固定聲線（隨機 NPC 才在 [Char] 自帶）
                if (!typeHint) typeHint = this.charVoices[p[0]] || '';

                this.updateSprite(p[0], rawExp);
                this.renderVN(p[0], _cx.text);
                this.addLog(p[0], _cx.text);
                this.playSFX(_cx.sfx !== 'NA' ? _cx.sfx : ex.sfx);
                // 第五欄 |Leave：這句演完(下一次 next)把該角色立繪撤下——強制狀態欄取代 AI 老忘記的 [Exit] 行
                if (ex.stage === 'leave') (this._pendingLeave = this._pendingLeave || []).push(p[0]);
                this._lastChar = p[0];
                this._currentChar = { charName: p[0], text: _cx.text, emotion: this._mapExprToEmotion(rawExp), expression: rawExp };
                this.updateControlUI();
                
                // 把 typeHint 傳給 TTS（用去 #SFX# 標記的文字，免得念出來）
                this._vnSoVITSPlay(p[0], _cx.text, this._mapExprToEmotion(rawExp), typeHint);

                (function(charName, text, expression) {
                    const _mm = (window.parent || window).OS_MINIMAX;
                    if (_mm) _mm.playForChar(charName, text, { expression });
                })(p[0], this._speechOnly(_cx.text), rawExp);   // 語音壓到「」內：混寫的旁白不進 TTS
                
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
                            
                            if (nex.text) _mm.prefetchForChar(np[0], VN_Core._speechOnly(nex.text), { expression: nRawExp });   // 預取跟播放同文字，快取才對得上
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
                const _ix = this._extractInlineSFX(ex.text);   // 正文內 #SFXID#
                const _innerClean = _ix.text.replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
                if (!_innerClean) { this.playSFX(_ix.sfx !== 'NA' ? _ix.sfx : ex.sfx); return this.next(); }   // 只剩音效→跳過空框
                this.updateSprite(p[0], 'Think');
                this.renderVN(p[0], _innerClean, 'inner');
                this.addLog(p[0], _innerClean);
                this.playSFX(_ix.sfx !== 'NA' ? _ix.sfx : ex.sfx);
                return;
            }
            if (line.startsWith('[Exit|')) {
                const p = line.slice(6, -1).split('|');
                if (p[0]) this._stageRemove(p[0].trim());   // 角色離場 → 移除該格立繪
                this.next();
                return;
            }
            if (line.startsWith('[Nar|')) {
                const p = line.slice(5, -1).split('|');
                const ex = this._extractTextAndSFX(p);
                const _nx = this._extractInlineSFX(ex.text);   // 正文內 #SFXID#
                // 整則只剩音效(剝標記後空) → 只播音效、跳過、不渲染空對話框
                if (!_nx.text) { this.playSFX(_nx.sfx !== 'NA' ? _nx.sfx : ex.sfx); return this.next(); }
                this._stageNarr();   // 旁白：算一場次(推進清滯留) + 立繪全留全部變暗
                this._currentChar = null; this.updateControlUI();
                this.renderVN('', _nx.text);
                this.addLog("旁白", _nx.text);
                this._vnNarrVoicePlay(_nx.text);
                this.playSFX(_nx.sfx !== 'NA' ? _nx.sfx : ex.sfx);
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
                const _ix = this._extractInlineSFX(_trimmed.replace(/^\*{1,2}|\*{1,2}$/g, '').trim());   // 正文內 #SFXID#
                if (!_ix.text) { this.playSFX(_ix.sfx); return this.next(); }
                this.renderVN('', _ix.text, 'inner');
                this.addLog('内心', _ix.text);
                this.playSFX(_ix.sfx);
                return;
            }
            const _stripped = _trimmed.replace(/^\[?/, '').replace(/\]$/, '').trim();
            if (_stripped.length > 2 && !_trimmed.startsWith('[') && !_trimmed.startsWith('<') && !_trimmed.startsWith('//') && !_trimmed.startsWith('---')) {
                const _nx = this._extractInlineSFX(_stripped);   // 正文內 #SFXID# → 抽音效 + 剝標記
                // 整行只剩音效(剝標記後空，如單獨一行 #fastrunning#) → 只播音效、跳過、不渲染空對話框
                if (!_nx.text) { this.playSFX(_nx.sfx); return this.next(); }
                this._stageNarr();   // 純文字旁白：算一場次(推進清滯留) + 立繪保留變暗
                this.renderVN('', _nx.text);
                this.addLog('旁白', _nx.text);
                this._vnNarrVoicePlay(_nx.text);
                this.playSFX(_nx.sfx);
                return;
            }
            this.next();
        },

        /* --- UI 切換與渲染 --- */
        hideOverlays: function() {
            ['sys-overlay', 'trans-overlay', 'item-overlay', 'quest-overlay'].forEach(id => { const _el = document.getElementById(id); if (_el) _el.classList.remove('active'); });
            // 🎬 scene-cg-overlay 走鋪底式：linger>0 期間留著（由 renderVN 計數淡出），不被每句 next 的 hideOverlays 秒關
            if (this._sceneCgLinger <= 0 && !this._sceneCgHold) { const _sc = document.getElementById('scene-cg-overlay'); if (_sc) _sc.classList.remove('active'); }
            document.getElementById('text-panel-wrapper').style.display = 'block';
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
        closeCtx: function() {
            const popup = document.getElementById('vn-ctx-popup');
            if (popup) popup.classList.remove('show');
            const btn = document.getElementById('vn-btn-ctx');
            if (btn) btn.classList.remove('active');
        },
        // 🛠️ 故事管理：開 OS_STORY_TOOLS 完整面板（大總結 + 編輯模板 + 合併 + 隱藏對話）。取代原 CTX 的「📝 大總結」快捷鈕。
        openStoryTools: function() {
            this.closeCtx();
            const st = window.OS_STORY_TOOLS || (window.parent && window.parent.OS_STORY_TOOLS);
            const cont = document.getElementById('page-game') || document.body;
            if (st && typeof st.openPanel === 'function') st.openPanel(cont);
            else alert('故事管理工具尚未載入');
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
                    if (line.startsWith('[Char|'))  { const p = this._normCharParts(line.slice(6,-1).split('|')); const ex=this._extractTextAndSFX(p.slice(2)); this.addLog(p[0], this._stripInlineSFX(ex.text)); }
                    else if (line.startsWith('[Inner|')) { const p = line.slice(7,-1).split('|'); const ex=this._extractTextAndSFX(p.slice(1)); this.addLog(p[0], `*${this._stripInlineSFX(ex.text)}*`); }
                    else if (line.startsWith('[Nar|'))  { const p = line.slice(5,-1).split('|'); const ex=this._extractTextAndSFX(p); this.addLog("旁白", this._stripInlineSFX(ex.text)); }
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
            // 🎬 鋪底式場景插圖：每渲染一句對話 -1，停滿 3 句就淡出（CSS opacity transition）
            if (this._sceneCgLinger > 0 && !this._sceneCgHold) {   // 正常插圖：每句 -1，停滿 3 句淡出
                this._sceneCgLinger--;
                if (this._sceneCgLinger <= 0) {
                    const _scOv = document.getElementById('scene-cg-overlay');
                    if (_scOv) _scOv.classList.remove('active');
                    const _scIm = document.getElementById('scene-cg-img');
                    if (_scIm) setTimeout(() => { const o = document.getElementById('scene-cg-overlay'); if (o && !o.classList.contains('active')) _scIm.src = ''; }, 600);
                }
            } else if (this._sceneCgHold && this._sceneCgFailLinger > 0) {   // 失敗佔位：玩家沒手動重生 → 也倒數 3 則後自己淡掉、不永遠卡著
                this._sceneCgFailLinger--;
                if (this._sceneCgFailLinger <= 0) {
                    this._sceneCgHold = false;
                    const _scOv = document.getElementById('scene-cg-overlay');
                    if (_scOv) _scOv.classList.remove('active', 'scene-cg-failed');
                    const _scIm = document.getElementById('scene-cg-img');
                    if (_scIm) setTimeout(() => { const o = document.getElementById('scene-cg-overlay'); if (o && !o.classList.contains('active')) _scIm.src = ''; }, 600);
                }
            }
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

        // 原始查表（不過濾 none）：外觀字串照實回傳，給 _isNoneChar 判斷用
        _lookupAvatarDesc: function(name) {
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
        // 「none」＝AI 宣告了聲線但沒給外觀（帶代號的路人，如 [Avatar|巡邏員|青男沉|none]）
        //   ⚠️ 以前 'none' 會被當成外觀字串直接拿去生圖(生出垃圾/裸圖)，這裡統一視同「沒外觀」
        _isNoneDesc: function(d) { return !d || /^none$/i.test(String(d).trim()); },
        _isNoneChar: function(name) { const d = this._lookupAvatarDesc(name); return !!d && /^none$/i.test(String(d).trim()); },
        _resolveAvatarPrompt: function(name) {
            const d = this._lookupAvatarDesc(name);
            return this._isNoneDesc(d) ? '' : d;   // none → ''，由呼叫端決定「剪影」還是「合成 prompt」
        },
        // 聲線模糊抓性別 → 1boy / 1girl（如「青男沉」→ 男 → 1boy）；抓不到就不掛性別詞
        _genderFromVoice: function(name) {
            let v = (this.charVoices && this.charVoices[name]) || '';
            if (!v) { for (const k of this._nameVariants(name)) { if (this.charVoices && this.charVoices[k]) { v = this.charVoices[k]; break; } } }
            v = String(v || '');
            if (/男|male|boy/i.test(v)) return '1boy';
            if (/女|female|girl/i.test(v)) return '1girl';
            return '';
        },
        // none 路人的 prompt 合成（立繪模式 / 一鍵生立繪 專用）：
        //   「故事標題, 角色名」→ 翻成英文（同 Bg 的中→英作法）→ 前面掛聲線推出的 1boy/1girl。
        //   回傳的英文串會被存進 avatar_cache.prompt，一鍵生立繪之後可直接重用。
        _buildNonePrompt: async function(name) {
            const title = this._currentStoryTitle || '';
            const zh = [title, name].filter(Boolean).join(', ');
            let en = zh;
            try {
                const TM = win.TranslationManager;
                if (TM && typeof TM.translate === 'function' && (!TM.isChinese || TM.isChinese(zh))) {
                    const t = await TM.translate(zh, 'zh', 'en');
                    if (t && String(t).trim()) en = String(t).trim();
                }
            } catch (e) { console.warn('[VN] none 角色 prompt 翻譯失敗，用原文：', e); }
            const p = [this._genderFromVoice(name), en].filter(Boolean).join(', ');
            console.log(`[VN] none 路人「${name}」合成立繪 prompt：${p}`);
            return p;
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
            const isSlot = el.id === 'game-char' || el.id === 'game-char-2';
            // 圖真正冒出來的那一刻重打一次燈：晚到的圖立即拿到正確版位（獨角置中/雙格近遠），
            // 不用等下一句對話才補正（治「單人先卡左位、隔幾句才滑去中間」）
            const relight = () => { if (isSlot) { try { this._applyStageLighting(this._lastLightIdx != null ? this._lastLightIdx : -1); } catch (e) {} } };
            if (src !== undefined) el.src = src;
            // 已經在顯示同一張圖 → 只確保亮著，不重跑淡入（避免同角色連說 / 旁白後再開口時閃爍）
            if (sameSrc && visible) { el.style.display = 'block'; el.style.opacity = '1'; relight(); return; }
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.display = 'block';
            requestAnimationFrame(() => {
                el.style.transition = 'opacity 0.18s ease';
                el.style.opacity = '1';
                relight();
                // 淡入完把行內 transition 清掉 → 還給樣式表的 left/height/max-width transition
                //（行內只剩 opacity 會把版位/尺寸的過渡蓋死，近遠互換就不平滑）
                if (isSlot) setTimeout(() => { if (el.style.opacity === '1') el.style.transition = ''; }, 260);
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

        // ===== 雙格立繪舞台＋角色卡（2026-07-17 拆檔）＝> vn_core_stage.js =====
        //    含：_slotEl/_stageInit/_singleSlot/_slotMemory/_stageIndexFor/_slotShowing/_applyStageLighting/
        //        _stageDimAll/_stageNarr/_clearSlot/_stageRemove/_stageClear/_staleSweep/_tryLoad/updateSprite/
        //        _renderSlot/updateCallAvatar/handleImgError/fallbackToAI/_applyAvatarAnim/_readCharState/_charCV/
        //        saveCharCV/unlockCharCV/autoGenSprite/_spriteTap/openCharCard/closeCharCard
        //    Object.assign 掛回 VN_Core（this 語義不變），載入順序排本檔之後。
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
        async backupAvatarsToWorldbook(btn) {
            const tr = win.toastr || window.toastr;
            const _orig = btn ? btn.textContent : '';
            if (btn) { btn.disabled = true; btn.textContent = '⏳ 備份中…'; }
            try {
                const r = await window.VN_Core.backupAvatarsToCharLorebook();
                if (r && r.ok) { tr && tr.success(r.msg, '頭像備份'); }
                else { tr && tr.warning((r && r.msg) || '備份未完成', '頭像備份'); }
            } catch (e) {
                tr && tr.error('備份失敗：' + ((e && e.message) || e), '頭像備份');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = _orig; }
            }
        },
        loadBgManager,       // 供 vn_settings.js 外接調用（BG 快取列表）
        loadSpriteManager,   // 立繪庫網格（sprite_cache，世界感知）
        loadSceneManager: window.VN_Panels.loadSceneManager,   // 場景插圖展廳（scene_cache，與頭像同套卡片管理）

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
                s = s.replace(/#[A-Za-z0-9_\-&]+#/g, '');   // 剝掉正文內 #SFXID# 音效標記
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
                window.VN_Core.loadScript(_pScript, _pMsgId);   // loadScript 尾端已 applyLatestFresh()，最新這輪插圖在此插入
                switchPage('page-game');
                window.VN_Core.next();   // 開場閘門在 next() 內建：劇情文本渲染前自動等圖
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

        function init() {
            if (!window.TavernHelper) { setTimeout(init, 1000); return; }
            if (!window.eventOn || !window.tavern_events) { setTimeout(init, 500); return; }

            // ── ⭐ END-driven：跟副模型(state_runtime)同一套——純 GENERATION_ENDED 驅動，生成「真的結束」才讀正文判完整。
            //    取代舊「MESSAGE_RECEIVED(事件來得早、半截)+每1.5秒輪詢等收尾+_processedIds鎖樓號」：鎖會讓刪樓/重生落同樓號永不再套用。
            //    完整正文＝同時有 <content> 與 </content>(正文收尾)。重複套用守門靠 _lastApplied 特徵比對(見 _onGenEnded)。
            // 先剝 CoT 再判/取正文：<thinking> 裡提到 <content> 字樣不能當「正文開始」，否則會把 CoT 包進正文
            function _noCot(t) { return String(t).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, ''); }
            function _hasOpen(t)  { return _noCot(t).indexOf('<content>')  !== -1; }
            function _hasClose(t) { return _noCot(t).indexOf('</content>') !== -1; }
            // 已套用特徵：擋掉「副模型在 🍎/generateRaw 模式也會發 GENERATION_ENDED 但沒設 __AURELIA_SUMMARIZING」「事件偶爾連發」
            //   造成的重複 loadScript（會洗掉剛 splice 進去的場景插圖）。比對「同樓號＋同 <content> 內容」才算已套用。
            let _lastApplied = null;   // { mid, sig }
            function _sig(text) { const s = _noCot(text); const m = s.match(/<content>([\s\S]*?)<\/content>/i); const b = m ? m[1] : s; return b.length + '|' + b.slice(0, 40) + '|' + b.slice(-40); }
            let _truncMsgId = null;
            // VN 是否正在前景（玩家在看故事）→ 此時主模型這通理應產出 <content>…</content>，沒收尾＝截斷。
            // 用來判斷「連 <content> 都還沒生出來就截斷(思考期截)」要不要當截斷，避免誤傷非 VN 的一般聊天訊息。
            function _vnVisibleNow() { const p = document.getElementById('aurelia-vn-panel'); return !!(p && p.style.display !== 'none' && document.getElementById('page-game')); }
            function _hideTruncBanner() { const b = document.getElementById('vn-trunc-banner'); if (b) b.classList.remove('show'); }
            // 重試：/regenerate(整則重生，破甲截斷首選) 或 /continue(接著補寫，乾淨早停用)。
            // 補/重生完會再發 GENERATION_ENDED → 收尾完整就自動套用；先清 _lastApplied，確保即使內容雷同也照樣重套。
            function _retryTrunc(cmd) {
                _hideTruncBanner();
                const th = window.TavernHelper || (window.parent && window.parent.TavernHelper) || (window.top && window.top.TavernHelper);
                if (!th || typeof th.triggerSlash !== 'function') { try { (window.toastr || (window.parent && window.parent.toastr)).warning('找不到酒館助手，請回酒館手動操作'); } catch (e) {} return; }
                _lastApplied = null;
                try { window.VN_Core._showWriterCurtain(); } catch (e) {}
                th.triggerSlash(cmd).catch(function () {});
            }
            function _rerollTrunc() { _retryTrunc('/regenerate'); }
            function _continueTrunc() { _retryTrunc('/continue'); }
            function _showTruncBanner(messageId) {
                _truncMsgId = messageId;
                let b = document.getElementById('vn-trunc-banner');
                if (!b) {
                    b = document.createElement('div');
                    b.id = 'vn-trunc-banner';
                    b.innerHTML =
                        '<div class="vn-trunc-msg">⚠️ 正文被截斷</div>' +
                        '<div class="vn-trunc-sub">沒收到結尾（缺 &lt;/content&gt; 或 &lt;/summary&gt;）</div>' +
                        '<div class="vn-trunc-btns">' +
                            '<button class="vn-trunc-btn vn-trunc-primary" id="vn-trunc-regen">重新生成</button>' +
                            '<button class="vn-trunc-btn" id="vn-trunc-cont">繼續生成</button>' +
                            '<button class="vn-trunc-btn" id="vn-trunc-close">關閉</button>' +
                        '</div>';
                    // 掛到頂層 body（不掛 page-game）→ 搭配 fixed + 高 z-index 浮在資訊中心 overlay(9999) 之上，不被擋住
                    document.body.appendChild(b);
                    b.querySelector('#vn-trunc-regen').onclick = _rerollTrunc;
                    b.querySelector('#vn-trunc-cont').onclick = _continueTrunc;
                    b.querySelector('#vn-trunc-close').onclick = function () { _hideTruncBanner(); try { window.VN_Core._hideWriterCurtain(); } catch (e) {} };
                }
                b.classList.add('show');
            }

            function _readMsgText(messageId) {
                let text = '';
                const stCtx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
                if (stCtx && stCtx.chat && stCtx.chat[messageId]) {
                    const m = stCtx.chat[messageId];
                    text = m.mes || m.message || m.content || '';
                }
                if (!text) {
                    try {
                        const msgs = window.TavernHelper.getChatMessages(messageId);
                        if (msgs && msgs.length > 0) text = msgs[0].message || msgs[0].mes || msgs[0].content || '';
                    } catch (e) {}
                }
                // TauriTavern 懶載入會讓「樓號 ≠ 陣列索引」拿不到 → 退而求其次讀最後一條 AI 訊息
                // （GENERATION_ENDED 當下，最新一則 AI 正文就是最後一條）
                if (!text && stCtx && Array.isArray(stCtx.chat) && stCtx.chat.length) {
                    const last = stCtx.chat[stCtx.chat.length - 1];
                    if (last && !last.is_user) text = last.mes || last.message || last.content || '';
                }
                return text;
            }

            function _apply(text, messageId) {
                _hideTruncBanner();   // 真的套用到劇本了 → 收掉截斷橫幅（純 DOM，不影響套用流程）
                const _vnPanel = document.getElementById('aurelia-vn-panel');
                const _vnVisible = _vnPanel && _vnPanel.style.display !== 'none';
                if (_vnVisible && document.getElementById('page-game')) {
                    switchPage('page-game');
                    window.VN_Core.loadScript(text, messageId);   // loadScript 尾端已 applyLatestFresh()，最新這輪插圖在此插入
                    window.VN_Core.next();   // 開場閘門在 next() 內建：劇情文本渲染前自動等圖
                    console.log('[PhoneOS] 自動偵測：已套用新劇本 (訊息 ID:', messageId, ')');
                } else {
                    window._pendingAutoScript = { text: text, messageId: messageId };
                    console.log('[PhoneOS] 自動偵測：劇本已暫存，待開啟 VN app 後套用');
                }
            }

            // ── ⭐ 套用入口：生成真正結束 → 讀完整正文 → 完整就套用、截斷就疊橫幅。debounce 收斂連發事件 + 等 TauriTavern 正文寫定。──
            let _endTimer = null, _curtainSafety = null;
            function _onGenEnded(messageId) {
                if (window.__AURELIA_SUMMARIZING) return;   // 大總結 generateRaw 發的 END 不是正文
                clearTimeout(_curtainSafety);
                clearTimeout(_endTimer);
                _endTimer = setTimeout(() => {
                    try {
                        const text = _readMsgText(messageId);
                        if (_hasOpen(text) && _hasClose(text)) {
                            const sig = _sig(text);
                            // 同一則、同內容已套用過 → 這通多半是副模型(🍎/generateRaw 也發 END)或事件連發 → 跳過，免得重跑 loadScript 洗掉場景插圖
                            if (_lastApplied && _lastApplied.mid === messageId && _lastApplied.sig === sig) return;
                            _apply(text, messageId);
                            _lastApplied = { mid: messageId, sig: sig };
                        } else {
                            try { window.VN_Core._hideWriterCurtain(); } catch (e) {}
                            // 截斷：①有 <content> 沒收尾＝正文截在中間 ②連 <content> 都沒(思考期就截) → 只在 VN 前景時當截斷，避免誤判非 VN 訊息
                            if (_hasOpen(text) || _vnVisibleNow()) _showTruncBanner(messageId);
                        }
                    } catch (e) { console.error('[PhoneOS] 自動偵測失敗:', e); }
                }, 600);
            }
            if (window.tavern_events.GENERATION_ENDED) window.eventOn(window.tavern_events.GENERATION_ENDED, _onGenEnded);

            // 生成開始（VN 前景、非空跑/非總結）→ 立刻蓋「故事撰寫中」黑幕，避免玩家看到主模型逐字裸寫；套用或截斷時自然收掉。
            //    安全閥：5 分鐘內沒等到 GENERATION_ENDED（生成卡死）→ 收幕並提示重生，避免黑幕卡死。
            if (window.tavern_events.GENERATION_STARTED) {
                window.eventOn(window.tavern_events.GENERATION_STARTED, (type, opts, dryRun) => {
                    if (dryRun || window.__AURELIA_SUMMARIZING) return;
                    if (!_vnVisibleNow()) return;
                    try { window.VN_Core._showWriterCurtain(); } catch (e) {}
                    clearTimeout(_curtainSafety);
                    _curtainSafety = setTimeout(() => { try { window.VN_Core._hideWriterCurtain(); } catch (e) {} _showTruncBanner(null); }, 300000);
                });
            }

            // 使用者改動樓層 → 清「已套用」記號，讓下次 GENERATION_ENDED 必定重套（刪樓/swipe/手動編輯後重生能重新套用）。
            //    ★只收使用者動作；不收 MESSAGE_UPDATED（那是場景插圖 splice／AVS 程式寫入，清了會讓下一通副模型 END 重套→洗掉插圖）。
            ['MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED'].forEach(name => {
                const ev = window.tavern_events[name];
                if (ev) window.eventOn(ev, () => { _lastApplied = null; });
            });

            if (window.tavern_events.CHAT_CHANGED) {
                window.eventOn(window.tavern_events.CHAT_CHANGED, () => {
                    clearTimeout(_endTimer); clearTimeout(_curtainSafety);
                    _lastApplied = null;
                    _hideTruncBanner();
                    try { window.VN_Core._hideWriterCurtain(); } catch (e) {}
                });
            }

            console.log('[PhoneOS] VN 自動劇本偵測已啟動（END-driven）');
        }
        init();
    }());

})();
