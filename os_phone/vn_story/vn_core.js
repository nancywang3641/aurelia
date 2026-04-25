// ----------------------------------------------------------------
// [檔案] vn_core.js (V8.6 - 模組化重構版 + SFX 音效防重疊與5秒限制 + 世界書頭像擴展 + 主頁背景音樂)
// 路徑：os_phone/vn_story/vn_core.js
// 職責：VN 視覺小說播放器 - 核心功能與主邏輯
// ⚠️ 依賴 vn_styles.js 與 vn_phone.js，必須在其之後載入
// ----------------------------------------------------------------
(function () {
    console.log('[PhoneOS] 載入 VN 視覺小說播放器 (V8.6 - 核心模組化 + SFX優化 + 世界書頭像 + 主頁BGM)...');
    const win = window.parent || window;

    // === 1. IDB 核心快取系統 ===
    function _openIDB() {
        return new Promise((res, rej) => {
            const req = indexedDB.open('vn_player_db', 6);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('bg_cache'))     db.createObjectStore('bg_cache');
                if (!db.objectStoreNames.contains('avatar_cache')) db.createObjectStore('avatar_cache');
                if (!db.objectStoreNames.contains('item_cache'))   db.createObjectStore('item_cache');
                if (!db.objectStoreNames.contains('chat_bg'))      db.createObjectStore('chat_bg');
                if (!db.objectStoreNames.contains('scene_cache'))  db.createObjectStore('scene_cache');
                if (db.objectStoreNames.contains('handles'))       db.deleteObjectStore('handles');
            };
            req.onsuccess = e => res(e.target.result);
            req.onerror = () => rej(req.error);
        });
    }

    const VN_Cache = {
        async get(store, key) {
            try {
                const db = await _openIDB();
                return new Promise((res, rej) => {
                    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
                    req.onsuccess = () => res(req.result || null);
                    req.onerror = () => rej(req.error);
                });
            } catch(e) { return null; }
        },
        async set(store, key, value) {
            try {
                const db = await _openIDB();
                return new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).put(value, key);
                    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                });
            } catch(e) {}
        },
        async delete(store, key) {
            try {
                const db = await _openIDB();
                return new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).delete(key);
                    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                });
            } catch(e) {}
        },
        async getAll(store) {
            try {
                const db = await _openIDB();
                return new Promise(res => {
                    const results = [];
                    const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
                    req.onsuccess = e => {
                        const c = e.target.result;
                        if (c) { results.push({ key: c.key, ...c.value }); c.continue(); }
                        else res(results);
                    };
                    req.onerror = () => res([]);
                });
            } catch(e) { return []; }
        }
    };

    // === 2. 系統配置 & 生圖引擎 ===
    const VN_Config = {
        data: { bgm: '', sfx: '', spriteBase: '', stickerBase: '', charDefaultBase: '', finalFallbackSprite: 'https://files.catbox.moe/9je7j2.png', avatarBasePrompt: '', avatarNegPrompt: 'bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text', bgBasePrompt: '', bgNegPrompt: 'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render', itemBasePrompt: 'item only, product shot, no background, white background, clean illustration, high quality', itemNegPrompt: 'person, human, character, body, face, hands, people, crowd, bad anatomy, blurry, low quality, worst quality, watermark, text', homeBgBase: '', homeBgCount: '0', homeBgExt: 'jpg', ctxChapters: 5 },
        // UI 設置由 vn_settings.js 管理，此處只負責從 localStorage 載入供運行期使用
        load: function() {
            const s = localStorage.getItem('vn_cfg_v4');
            if (s) this.data = { ...this.data, ...JSON.parse(s) };
        }
    };

    // === Prompt 排列管理（讀取順序供 API 使用，UI 統一在 os_prompts.js） ===
    const VN_PromptOrder = {
        STORAGE_KEY: 'vn_prompt_order',

        getOrder() {
            // 返回 bundle ID 列表（全域順序），供 os_api_engine 排序用
            try {
                const saved = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
                if (Array.isArray(saved) && saved.length) return saved;
            } catch(e) {}
            return (win.OS_PROMPTS?.getBundles?.() || []).map(b => b.id);
        },

        saveOrder(order) { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(order)); },
        reset()          { localStorage.removeItem(this.STORAGE_KEY); }
    };
    window.VN_PromptOrder = VN_PromptOrder;

    const VN_Image = {
        _join: function(...parts) { return parts.filter(Boolean).join(', '); },
        getBg: async function(prompt) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateBackgroundAsync === 'function') {
                const full = this._join(VN_Config.data.bgBasePrompt, prompt);
                return await win.OS_IMAGE_MANAGER.generateBackgroundAsync(full, { width: 1024, height: 768, negativePrompt: VN_Config.data.bgNegPrompt || undefined });
            } return "";
        },
        getAvatar: async function(prompt, exp) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generate === 'function') {
                // type='char' → generate() 自動疊加 charBasePrompt + charNegPrompt，無需手動讀取
                // 順序：VN追加詞 → 角色描述詞 → 表情，charBasePrompt 由 generate() 前置
                const full = this._join(VN_Config.data.avatarBasePrompt, prompt, `${exp} expression`);
                // VN 自訂負詞優先；若空則 generate() 自動補 charNegPrompt
                const negPrompt = VN_Config.data.avatarNegPrompt || undefined;
                return await win.OS_IMAGE_MANAGER.generate(full, 'char', { negativePrompt: negPrompt });
            } return "";
        },
        getItem: async function(prompt) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateItem === 'function') {
                return await win.OS_IMAGE_MANAGER.generateItem(prompt);
            } return "";
        },
        getScene: async function(prompt) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generate === 'function') {
                // ★ 直接把 prompt 丟給 generate，type='scene'
                //   OS_IMAGE_MANAGER._genNovelAI 會自動套用 os_settings.js 中的
                //   charBasePrompt / charNegPrompt（避免用空的 VN_Config.data 設定）
                // NAI 免費無限小圖：直式插圖 512×768（不耗 Anlas）
                return await win.OS_IMAGE_MANAGER.generate(prompt, 'scene', { width: 512, height: 768 });
            } return "";
        }
    };

    // === 2.5. 上下文監控器 ===
    const VN_CtxMonitor = {
        sendTokens: null, sendChars: null,
        recvTokens: null, recvChars: null,
        msgs: null, lastUpdate: null,

        // 讀取用戶設定的警戒 token 上限（localStorage 持久化）
        getLimit: function() {
            return parseInt(localStorage.getItem('vn_ctx_limit') || '50000') || 50000;
        },
        saveLimit: function(val) {
            const n = Math.max(1000, parseInt(val) || 50000);
            localStorage.setItem('vn_ctx_limit', String(n));
            this._refreshDisplay();
        },

        // 獨立模式：從 OS_API._lastCtx 讀取
        _readFromStandalone: function() {
            try {
                const ctx = win.OS_API?._lastCtx;
                if (!ctx) return false;
                this.sendTokens = ctx.sendTokens;
                this.sendChars  = ctx.sendChars;
                this.recvTokens = ctx.recvTokens;
                this.recvChars  = ctx.recvChars;
                this.msgs       = ctx.msgCount;
                this.lastUpdate = new Date(ctx.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return true;
            } catch(e) { return false; }
        },

        // ST 模式：優先讀插件全域變數
        _readFromPlugin: function() {
            try {
                const g = win.extension_settings?.variables?.global;
                if (!g) return false;
                const sT = parseInt(g.LAST_SEND_TOKENS);
                const sC = parseInt(g.LAST_SEND_CHARS);
                const rT = parseInt(g.LAST_RECEIVE_TOKENS);
                const rC = parseInt(g.LAST_RECEIVE_CHARS);
                if (!isNaN(sT)) this.sendTokens = sT;
                if (!isNaN(sC)) this.sendChars  = sC;
                if (!isNaN(rT)) this.recvTokens = rT;
                if (!isNaN(rC)) this.recvChars  = rC;
                return !isNaN(sT);
            } catch(e) { return false; }
        },

        // 從 console 攔截更新（ST 模式插件未安裝時備援）
        updateSend: function(tokens, chars) {
            this.sendTokens = tokens; this.sendChars = chars;
            this.lastUpdate = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this._refreshDisplay();
        },
        updateRecv: function(tokens, chars) {
            this.recvTokens = tokens; this.recvChars = chars;
            this._refreshDisplay();
        },
        updateMsgs: function(count) {
            this.msgs = count;
            this._refreshDisplay();
        },

        // 點開 Ctx 時呼叫
        poll: function() {
            const isStandalone = win.OS_API?.isStandalone?.() ?? false;
            if (isStandalone) {
                this._readFromStandalone();
            } else {
                this._readFromPlugin();
                this.lastUpdate = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
            // 同步 input 顯示值
            const limitInput = document.getElementById('ctx-limit-input');
            if (limitInput) limitInput.value = this.getLimit();
            this._refreshDisplay();
        },

        _refreshDisplay: function() {
            try {
                const eT    = document.getElementById('ctx-tokens');
                const eC    = document.getElementById('ctx-chars');
                const eRT   = document.getElementById('ctx-recv-tokens');
                const eRC   = document.getElementById('ctx-recv-chars');
                const eM    = document.getElementById('ctx-msgs');
                const eTime = document.getElementById('ctx-time');
                if (eT)  eT.textContent  = this.sendTokens != null ? this.sendTokens.toLocaleString() : '—';
                if (eC)  eC.textContent  = this.sendChars  != null ? this.sendChars.toLocaleString()  : '—';
                if (eRT) eRT.textContent = this.recvTokens != null ? this.recvTokens.toLocaleString() : '—';
                if (eRC) eRC.textContent = this.recvChars  != null ? this.recvChars.toLocaleString()  : '—';
                if (eM)  eM.textContent  = this.msgs       != null ? this.msgs.toLocaleString()       : '—';
                if (eTime) eTime.textContent = this.lastUpdate ? `更新 ${this.lastUpdate}` : '尚未偵測到數據';

                // 進度條
                const barFill   = document.getElementById('ctx-bar-fill');
                const usageText = document.getElementById('ctx-usage-text');
                if (barFill && usageText && this.sendTokens != null) {
                    const limit = this.getLimit();
                    const pct   = Math.min(100, Math.round((this.sendTokens / limit) * 100));
                    const level = pct >= 100 ? 'danger' : pct >= 70 ? 'warn' : '';
                    barFill.style.width = pct + '%';
                    barFill.className   = 'ctx-bar-fill' + (level ? ' ' + level : '');
                    usageText.textContent = `${this.sendTokens.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)`;
                    usageText.className   = 'ctx-usage-text' + (level ? ' ' + level : '');
                    // 超過警戒：讓 Ctx 按鈕閃爍提示
                    const ctxBtn = document.getElementById('vn-btn-ctx');
                    if (ctxBtn) {
                        if (level === 'danger') {
                            ctxBtn.style.color  = '#ff6b6b';
                            ctxBtn.title        = '⚠️ 已超過警戒 Token！建議立即總結';
                        } else if (level === 'warn') {
                            ctxBtn.style.color  = '#f6ad55';
                            ctxBtn.title        = '注意：Token 用量已達 70%';
                        } else {
                            ctxBtn.style.color  = '';
                            ctxBtn.title        = '';
                        }
                    }
                }

                const popup = document.getElementById('vn-ctx-popup');
                if (popup && popup.classList.contains('show')) {
                    popup.classList.remove('ctx-pulse');
                    void popup.offsetWidth;
                    popup.classList.add('ctx-pulse');
                }
            } catch(e) {}
        }
    };

    // console.log 攔截：備援（插件未安裝）+ 捕捉訊息數（插件不寫全域變數）
    (function() {
        const _orig = console.log;
        // 用第一個 arg 做快速前置過濾，避免每條 log 都做 join + regex
        console.log = function(...args) {
            _orig.apply(console, args);
            try {
                const first = typeof args[0] === 'string' ? args[0] : '';
                // 只處理來自 Prompt Template 或 processing 的 log，其他全部跳過
                if (!first.includes('processing') && !first.includes('[Prompt Template]')) return;
                const msg = args.join(' ');
                const hasPlugin = !!win.extension_settings?.variables?.global?.LAST_SEND_TOKENS;
                if (!hasPlugin) {
                    if (msg.includes('send result')) {
                        const m1 = msg.match(/processing send result:\s*(\d+)\s*tokens and\s*(\d+)\s*chars/);
                        if (m1) { VN_CtxMonitor.updateSend(parseInt(m1[1]), parseInt(m1[2])); return; }
                    }
                    if (msg.includes('receive result')) {
                        const m3 = msg.match(/processing receive result:\s*(\d+)\s*tokens and\s*(\d+)\s*chars/);
                        if (m3) { VN_CtxMonitor.updateRecv(parseInt(m3[1]), parseInt(m3[2])); return; }
                    }
                }
                // 訊息數（插件不寫全域，只能從 log 取）
                if (msg.includes('[Prompt Template]')) {
                    const m2 = msg.match(/\[Prompt Template\] processing (\d+) messages in/);
                    if (m2) VN_CtxMonitor.updateMsgs(parseInt(m2[1]));
                }
            } catch(e) {}
        };
    })();

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

            const hides = ['speaker-name', 'game-char', 'char-portrait', 'top-badge'];
            hides.forEach(id => {
                const el = document.getElementById(id);
                if(el) el.style.display = 'none';
            });

            // 清除場景插圖 overlay（防止跨章節殘留）
            const sceneCgOverlay = document.getElementById('scene-cg-overlay');
            if (sceneCgOverlay) sceneCgOverlay.classList.remove('active');
            const sceneCgImg = document.getElementById('scene-cg-img');
            if (sceneCgImg) sceneCgImg.src = '';

            const bg = document.getElementById('game-bg');
            if (bg) {
                if (this._lastBgCacheId) {
                    // 有上一章背景：cacheId 存活，從 IDB 重新取 URL（blob 已被 resetState 撤銷）
                    bg.style.backgroundImage = 'none';
                    const _cid = this._lastBgCacheId;
                    (async () => {
                        const cached = await VN_Cache.get('bg_cache', _cid);
                        if (cached && cached.url && bg) {
                            const objUrl = await this._toObjectUrl(cached.url).catch(() => null);
                            const finalUrl = objUrl || cached.url;
                            bg.style.backgroundImage = `url('${finalUrl}')`;
                        }
                    })();
                } else {
                    bg.style.backgroundImage = 'none';
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

        // ----------------------------------------------------------------
        // 角色存檔器：從 <profile> Markdown 表格抽取角色資料存入 OS_WORLDBOOK
        // 防重複：以「角色名」為 key，已存在則跳過
        // ----------------------------------------------------------------
        _extractAndSaveProfiles: async function(rawText) {
            if (!win.OS_DB || typeof win.OS_DB.saveWorldbookEntry !== 'function') return;

            const profileReg = /<profile>([\s\S]*?)<\/profile>/gi;
            const newChars = [];
            let pm;

            while ((pm = profileReg.exec(rawText)) !== null) {
                const profileContent = pm[1];
                const rows = profileContent.split('\n').filter(l => l.trim().startsWith('|'));

                let isHeaderRow = true;
                for (const row of rows) {
                    const cells = row.split('|').map(c => c.trim()).filter(c => c);
                    if (!cells.length) continue;
                    // 分隔行（---）
                    if (cells.every(c => /^:?-+:?$/.test(c))) continue;
                    // 第一個有效行 = 標題行，跳過
                    if (isHeaderRow) { isHeaderRow = false; continue; }
                    // 角色資料行
                    if (cells[0]) newChars.push({ name: cells[0].trim(), cells, rawRow: row });
                }
            }

            if (!newChars.length) return;

            // 讀現有條目做防重複
            let existingTitles = new Set();
            try {
                const existing = await win.OS_DB.getAllWorldbookEntries();
                existing.forEach(e => existingTitles.add(e.title));
            } catch(e) {}

            const headers = ['名字', '身份', '性格核心', '衣着', '形象'];
            let saved = 0;

            for (const char of newChars) {
                if (existingTitles.has(char.name)) continue; // 已存在，跳過

                // 格式化內容
                const contentLines = char.cells.map((cell, i) => {
                    const label = headers[i] || `欄位${i + 1}`;
                    return `${label}：${cell}`;
                }).join('\n');

                // 如果 <avatar> 已解析出這個角色的生圖 prompt，一併存入
                const avatarPrompt = this.avatars?.[char.name] || '';
                const fullContent = avatarPrompt
                    ? `${contentLines}\n\n[外觀生圖標籤 (NAI)]\n${avatarPrompt}`
                    : contentLines;

                const entry = {
                    id: 'wb_char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
                    title: char.name,
                    content: fullContent,
                    category: '角色設定',
                    enabled: true,
                    order: Date.now() + saved,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                try {
                    await win.OS_DB.saveWorldbookEntry(entry);
                    existingTitles.add(char.name); // 同批次防重複
                    saved++;
                } catch(e) {
                    console.warn('[VN] 角色存入世界書失敗:', char.name, e);
                }
            }

            if (saved > 0) {
                console.log(`[VN] ✅ 已記錄 ${saved} 個新角色到獨立世界書（角色設定）`);
                if (win.toastr) win.toastr.info(`記錄了 ${saved} 個新角色`, '📖 角色登錄');
            }
        },

        loadScript: function (txt, messageId) {
            // 新一輪劇本載入時，自動關閉檔案庫面板
            if (window.AureliaHtmlExtractor && window.AureliaHtmlExtractor.isVisible) {
                window.AureliaHtmlExtractor.hide();
            }
            this.resetState();
            this._currentMessageId = messageId || null; // resetState 後覆寫，確保拿到正確 ID
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

            // 🧹 從 storyText 移除 <profile> 區塊（含 <details> 包裝）
            // 角色表不應出現在 VN 對話流中；資料會另存至 OS_WORLDBOOK
            storyText = storyText.replace(/<details[^>]*>[\s\S]*?<\/details>/gi, match =>
                match.includes('<profile>') ? '' : match
            );
            storyText = storyText.replace(/<profile>[\s\S]*?<\/profile>/gi, ''); 

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

            // 2. 新式：從 <profile> 表格的「頭像提示詞」欄讀取（最後一欄）
            const profReg = /<profile>([\s\S]*?)<\/profile>/g; let pm;
            while ((pm = profReg.exec(txtString)) !== null) {
                const rows = pm[1].split('\n').filter(l => l.trim().startsWith('|'));
                let headers = null;
                for (const row of rows) {
                    const cells = row.split('|').map(c => c.trim()).filter(c => c);
                    if (!cells.length) continue;
                    if (cells.every(c => /^:?-+:?$/.test(c))) continue; // 分隔行
                    if (!headers) { headers = cells; continue; }          // 標題行
                    const nameIdx  = 0;
                    // 找「頭像提示詞」欄位索引
                    const avatarIdx = headers.findIndex(h => /頭像|avatar|prompt/i.test(h));
                    if (avatarIdx < 0 || avatarIdx >= cells.length) continue;
                    const charName   = cells[nameIdx]?.trim();
                    const avatarPmt  = cells[avatarIdx]?.trim();
                    if (charName && avatarPmt && !this.avatars[charName]) {
                        this.avatars[charName] = avatarPmt;
                    }
                }
            }

            // 3. 新式：從 <summary> 的 char_new: 行讀取頭像 prompt（取代 <profile> 表格）
            const smReg = /<summary>([\s\S]*?)<\/summary>/g; let sm;
            while ((sm = smReg.exec(txtString)) !== null) {
                for (const line of sm[1].split('\n')) {
                    const cnMatch = line.match(/char_new\s*[:：]\s*([^|]+)\|(.+)/);
                    if (!cnMatch) continue;
                    const cnName = cnMatch[1].trim();
                    if (!cnName || this.avatars[cnName]) continue; // 已有則跳過（首次登場原則）
                    const kvStr = cnMatch[2];
                    const avatarKv = kvStr.match(/頭像\s*=\s*([^|]+)/);
                    if (avatarKv) this.avatars[cnName] = avatarKv[1].trim();
                }
            }

            // ⚠️ _extractAndSaveProfiles 已停用：自動把 VN 劇情角色寫入 OS_WORLDBOOK 會汙染世界書資料

            // 將 <branches> 選項附加到 script 末尾（由現有 [Choice|] 機制驅動顯示）
            if (_branchLines.length) {
                this.script.push(..._branchLines);
            }

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
        _showDomBlock: function(tagHint) {
            const _win = window.parent || window;
            const _doc = _win.document || document;

            // (前面取得 chatNode 的邏輯不變...)
            let chatNode = this._currentMessageId
                ? _doc.querySelector(`.mes[mesid="${this._currentMessageId}"] .mes_text`)
                : _doc.querySelector('#chat .mes.last_mes .mes_text');
            if (!chatNode) {
                chatNode = this._currentMessageId
                    ? _doc.querySelector(`.mes[mesid="${this._currentMessageId}"]`)
                    : _doc.querySelector('#chat .mes.last_mes');
            }

            if (!chatNode) { this.next(); return; }

            const tmpDiv = _doc.createElement('div');
            tmpDiv.innerHTML = chatNode.innerHTML;

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
            const domEl = blocks[this._domBlockCursor++];
            if (!domEl) { this.next(); return; }

            // 注入樣式（只做一次）
            if (!document.getElementById('vn-dbo-style')) {
                const _s = document.createElement('style');
                _s.id = 'vn-dbo-style';
                _s.textContent = [
                    '#vn-dom-block-overlay{position:absolute;inset:0;z-index:600;background:rgba(5,4,2,0.93);',
                    'display:flex;flex-direction:column;padding:20px 16px 14px;',
                    'transform:translateY(100%);transition:transform .35s cubic-bezier(.22,1,.36,1);overflow:hidden}',
                    '#vn-dom-block-overlay.active{transform:translateY(0)}',
                    '#vn-dom-block-body{flex:1;overflow-y:auto;overflow-x:hidden;color:#e8dfc8}',
                    '#vn-dom-block-body::-webkit-scrollbar{width:3px}',
                    '#vn-dom-block-body::-webkit-scrollbar-thumb{background:rgba(212,175,55,.3);border-radius:2px}',
                    /* 確保圖片（如 SD 插件的 sd-ui-image）在缺少原插件 CSS 時仍可見 */
                    '#vn-dom-block-body img{max-width:100%;height:auto;display:block;margin:0 auto;border-radius:6px}',
                    '#vn-dom-block-body>div,#vn-dom-block-body>section,#vn-dom-block-body>article{display:block;width:100%}',
                    '#vn-dom-block-close{flex-shrink:0;margin-top:14px;padding:10px;',
                    'background:rgba(212,175,55,.15);border:1px solid rgba(212,175,55,.4);',
                    'color:#d4af37;cursor:pointer;border-radius:6px;font-size:13px;',
                    'letter-spacing:2px;width:100%;transition:background .2s}',
                    '#vn-dom-block-close:hover{background:rgba(212,175,55,.28)}'
                ].join('');
                document.head.appendChild(_s);
            }

            // 建立 overlay（只做一次，之後重複使用）
            let overlay = document.getElementById('vn-dom-block-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'vn-dom-block-overlay';
                overlay.innerHTML = '<div id="vn-dom-block-body"></div><button id="vn-dom-block-close">▶ 繼續</button>';
                overlay.querySelector('#vn-dom-block-close').onclick = () => this._hideDomBlock();
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
                            const _thinking = win.OS_THINK?.getLatest()?.content?.trim() || '';
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

        _safeFetchBg: async function(cacheId, prompt) {
            if (this._bgMemCache[cacheId]) return this._bgMemCache[cacheId];
            const cached = await VN_Cache.get('bg_cache', cacheId);
            if (cached && cached.url) {
                if (cached.url.startsWith('blob:')) {
                    await VN_Cache.delete('bg_cache', cacheId);
                } else {
                    if (cached.rawUrl) _sessionBgRawUrls[cacheId] = cached.rawUrl;
                    const objUrl = await this._toObjectUrl(cached.url);
                    this._bgMemCache[cacheId] = objUrl || cached.url;
                    this._preloadImg(cacheId, this._bgMemCache[cacheId]);
                    return this._bgMemCache[cacheId];
                }
            }
            const raw = await VN_Image.getBg(prompt);
            if (!raw) return '';
            _sessionBgRawUrls[cacheId] = raw;
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
                this._bgMemCache[cacheId] = objUrl;
                this._preloadImg(cacheId, objUrl);
                if (dataUrl) await VN_Cache.set('bg_cache', cacheId, { prompt, rawUrl: raw, url: dataUrl });
                return objUrl;
            } catch(e) {
                const url = await this._toDataUrl(raw);
                if (url) {
                    this._bgMemCache[cacheId] = url;
                    this._preloadImg(cacheId, url);
                    await VN_Cache.set('bg_cache', cacheId, { prompt, rawUrl: raw, url });
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

        _prewarmBgs: function() {
            const tasks = [];
            const seen = new Set();
            for (const line of this.script) {
                if (!line.startsWith('[Bg|')) continue;
                const parts = line.slice(4, -1).split('|');
                const cacheId = parts[1];
                const prompt  = parts[2];
                if (!cacheId || !prompt || seen.has(cacheId)) continue;
                seen.add(cacheId);
                tasks.push({ cacheId, prompt });
            }
            if (!tasks.length) return;
            console.log(`[VN] 預熱背景：共 ${tasks.length} 張，依序生成中...`);
            (async () => {
                for (const { cacheId, prompt } of tasks) {
                    if (this._bgMemCache[cacheId]) {
                        this._preloadImg(cacheId, this._bgMemCache[cacheId]);
                        continue;
                    }
                    const cached = await VN_Cache.get('bg_cache', cacheId);
                    if (cached && cached.url && !cached.url.startsWith('blob:')) {
                        if (cached.rawUrl) _sessionBgRawUrls[cacheId] = cached.rawUrl;
                        const objUrl = await this._toObjectUrl(cached.url);
                        this._bgMemCache[cacheId] = objUrl || cached.url;
                        this._preloadImg(cacheId, this._bgMemCache[cacheId]);
                        continue;
                    }
                    if (cached && cached.url && cached.url.startsWith('blob:')) {
                        await VN_Cache.delete('bg_cache', cacheId);
                    }
                    if (!win.OS_IMAGE_MANAGER) continue;
                    const raw = await VN_Image.getBg(prompt);
                    if (raw) {
                        _sessionBgRawUrls[cacheId] = raw;
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
                            this._bgMemCache[cacheId] = objUrl;
                            this._preloadImg(cacheId, objUrl);
                            if (dataUrl) await VN_Cache.set('bg_cache', cacheId, { prompt, rawUrl: raw, url: dataUrl });
                        } catch(e) {
                            const url = await this._toDataUrl(raw);
                            if (url) {
                                this._bgMemCache[cacheId] = url;
                                this._preloadImg(cacheId, url);
                                await VN_Cache.set('bg_cache', cacheId, { prompt, rawUrl: raw, url });
                            }
                        }
                    }
                }
                console.log('[VN] 所有背景預熱完成');
            })();
        },

        _prewarmItems: function() {
            const tasks = [];
            const seen = new Set();
            for (const line of this.script) {
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
            // 格式 A：[Scene|cacheId|prompt] 單行
            for (let i = 0; i < this.script.length; i++) {
                const line = this.script[i];
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
                    while (j < this.script.length && this.script[j] !== '</scene>') {
                        const _l = this.script[j].trim();
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
            // 把 persona 名字也納入預熱（即使 AI 沒輸出 <profile>）
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
                const gc = document.getElementById('game-char'); if (gc) gc.style.display = 'none';
                const cp = document.getElementById('char-portrait'); if (cp) cp.style.display = 'none';
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
                    audio.src = VN_Config.data.bgm + name + '.mp3';
                    const onOk  = () => { this._showBgmToast(name, true);  cleanup(); };
                    const onErr = () => { this._showBgmToast(name, false); cleanup(); };
                    const cleanup = () => { audio.removeEventListener('canplay', onOk); audio.removeEventListener('error', onErr); };
                    audio.addEventListener('canplay', onOk,  { once: true });
                    audio.addEventListener('error',   onErr, { once: true });
                    audio.play().catch(() => {});
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
                document.getElementById('game-char').style.display = 'none';
                document.getElementById('char-portrait').style.display = 'none';
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
                    if (memUrl) {
                        document.getElementById('game-bg').style.backgroundImage = `url('${memUrl}')`;
                    } else {
                        (async () => {
                            const url = await this._safeFetchBg(cacheId, aiPrompt);
                            if (url) document.getElementById('game-bg').style.backgroundImage = `url('${url}')`;
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
            if (line.startsWith('[Achievement|')) {
                const parts = line.slice(13, -1).split('|');
                const name = parts[0] || '';
                const desc = parts[1] || '';
                this.addLog("成就解鎖", `${name}${desc ? ' — ' + desc : ''}`);
                document.getElementById('achievement-name').innerText = name;
                document.getElementById('achievement-desc').innerText = desc;
                document.getElementById('achievement-overlay').classList.add('active');
                if (win.OS_ACHIEVEMENT?.unlock) win.OS_ACHIEVEMENT.unlock(name, desc);
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
                return;
            }

            if (line.startsWith('[Trans|')) {
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
            if (line.startsWith('[Nar|')) {
                document.getElementById('game-char').style.display = 'none';
                document.getElementById('char-portrait').style.display = 'none';
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
                this.updateSprite(this._lastChar || '', 'Think');
                this.renderVN(this._lastChar || '', _innerText, 'inner');
                this.addLog(this._lastChar || '内心', _innerText);
                return;
            }
            const _stripped = _trimmed.replace(/^\[?/, '').replace(/\]$/, '').trim();
            if (_stripped.length > 2 && !_trimmed.startsWith('[') && !_trimmed.startsWith('<') && !_trimmed.startsWith('//') && !_trimmed.startsWith('---')) {
                document.getElementById('game-char').style.display = 'none';
                document.getElementById('char-portrait').style.display = 'none';
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
            document.getElementById('game-char').style.display = 'none';
            document.getElementById('char-portrait').style.display = 'none';
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
                nel.style.display = 'inline-block'; nel.innerText = n || '…';
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
            if (src !== undefined) el.src = src;
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.display = 'block';
            requestAnimationFrame(() => {
                el.style.transition = 'opacity 0.18s ease';
                el.style.opacity = '1';
            });
        },

        _tryLoad: function(targetImg, urls, fallback, onSuccess) {
            const guardName = this.currentName; // 鎖定當下角色，非同步回來再確認
            let idx = 0;
            const tryNext = () => {
                if (idx >= urls.length) { fallback(); return; }
                const url = urls[idx++];
                const tempImg = new Image();
                tempImg.onload = () => {
                    if (this.currentName !== guardName) return; // 已切換角色，丟棄
                    if (targetImg.id !== 'call-avatar') {
                        this._showEl(targetImg, url);
                    } else {
                        targetImg.src = url;
                    }
                    if (onSuccess) onSuccess(targetImg);
                };
                tempImg.onerror = () => {
                    if (this.currentName !== guardName) return; // 已切換角色，停止嘗試
                    tryNext();
                };
                tempImg.src = url;
            };
            tryNext();
        },

        updateSprite: function(name, exp) {
            const prevName = this.currentName;
            this.currentName = name; this.currentExp = exp;
            const img = document.getElementById('game-char');
            // 只有切換角色時才隱藏立繪，同角色連續說話不閃爍
            if (prevName !== name) {
                this._hideEl(document.getElementById('char-portrait'));
                this._hideEl(img);
            }

            const triggerAnim = (target) => {
                const isPortrait = target.id === 'char-portrait';
                const shakeClass = isPortrait ? 'portrait-shake' : 'sprite-shake';
                const jumpClass  = isPortrait ? 'portrait-jumpscare' : 'sprite-jumpscare';
                
                target.classList.remove(shakeClass, jumpClass);
                void target.offsetWidth; 
                
                if (exp === 'Surprised') target.classList.add(shakeClass);
                if (exp === 'JumpScare') target.classList.add(jumpClass);
            };

            if (VN_Config.data.spriteBase) {
                const urls = this._nameVariants(name).map(v => `${VN_Config.data.spriteBase}${v}_${exp}.png`);
                this._tryLoad(img, urls, () => this.handleImgError(img), triggerAnim);
            } else this.fallbackToAI(img);
        },
        
        updateCallAvatar: function(name) {
            this.currentName = name; this.currentExp = 'Neutral';
            const img = document.getElementById('call-avatar');
            if (VN_Config.data.spriteBase) {
                const urls = this._nameVariants(name).map(v => `${VN_Config.data.spriteBase}${v}_Neutral.png`);
                this._tryLoad(img, urls, () => this.handleImgError(img), null); 
            } else this.fallbackToAI(img);
        },
        
        handleImgError: function(img) {
            img.onerror = null;
            // 在 onerror 觸發時立即鎖定當前角色名，防止非同步回調時已切換到下一個角色
            const lockedName = this.currentName;
            const base = VN_Config.data.charDefaultBase;

            const triggerAnim = (target) => {
                if (this.currentName !== lockedName) return; // 已切換角色，拋棄動畫
                const isPortrait = target.id === 'char-portrait';
                const shakeClass = isPortrait ? 'portrait-shake' : 'sprite-shake';
                const jumpClass  = isPortrait ? 'portrait-jumpscare' : 'sprite-jumpscare';
                target.classList.remove(shakeClass, jumpClass);
                void target.offsetWidth;
                if (this.currentExp === 'Surprised') target.classList.add(shakeClass);
                if (this.currentExp === 'JumpScare') target.classList.add(jumpClass);
            };

            if (base) {
                const urls = this._nameVariants(lockedName).map(v => `${base}${v}_presets.png`);
                this._tryLoad(img, urls, () => {
                    if (this.currentName !== lockedName) return; // 已切換角色，拋棄 fallback
                    this.fallbackToAI(img);
                }, triggerAnim);
            } else {
                this.fallbackToAI(img);
            }
        },
        
        fallbackToAI: async function(img) {
            const name = this.currentName;
            
            // --- 世界書頭像 Fallback ---
            if (!this._lorebookLoaded) {
                await this._loadLorebookAvatars();
                this._lorebookLoaded = true;
                if (this.currentName !== name) return; // 角色已切換，放棄顯示
            }

            const lbUrl = this._lorebookAvatarCache[name] || this._lorebookAvatarCache[this._nameVariants(name).find(v => this._lorebookAvatarCache[v])];
            if (lbUrl) {
                if (this.currentName !== name) return;
                let targetEl = img;
                if (img.id === 'game-char') {
                    const portrait = document.getElementById('char-portrait');
                    this._showEl(portrait, lbUrl);
                    targetEl = portrait;
                } else {
                    if (img.id !== 'call-avatar') this._showEl(img, lbUrl); else img.src = lbUrl;
                }
                return this._applyAvatarAnim(targetEl);
            }
            // --- END ---

            // 1. 先查記憶體快取
            if (this._avatarMemCache[name]) {
                if (this.currentName !== name) return;
                const url = this._avatarMemCache[name];
                let targetEl = img;
                if (img.id === 'game-char') {
                    const portrait = document.getElementById('char-portrait');
                    this._showEl(portrait, url);
                    targetEl = portrait;
                } else {
                    if (img.id !== 'call-avatar') this._showEl(img, url); else img.src = url;
                }
                return this._applyAvatarAnim(targetEl);
            }

            // 防止同一角色並發重複生成：等待已在進行中的生成
            if (this._pendingAvatars[name]) {
                await this._pendingAvatars[name];
                if (this.currentName !== name) return;
                if (this._avatarMemCache[name]) {
                    const url = this._avatarMemCache[name];
                    let targetEl = img;
                    if (img.id === 'game-char') {
                        const portrait = document.getElementById('char-portrait');
                        this._showEl(portrait, url);
                        targetEl = portrait;
                    } else {
                        if (img.id !== 'call-avatar') this._showEl(img, url); else img.src = url;
                    }
                    this._applyAvatarAnim(targetEl);
                }
                return;
            }

            let _resolvePending;
            this._pendingAvatars[name] = new Promise(r => { _resolvePending = r; });

            try {
                // 2. 查 IndexedDB 資料庫
                const cached = await VN_Cache.get('avatar_cache', name);
                let url;
                if (cached && cached.url && !cached.url.startsWith('blob:')) {
                    const objUrl = await this._toObjectUrl(cached.url);
                    url = objUrl || cached.url;
                    this._avatarMemCache[name] = url;
                } else {
                    // 3. 記憶體跟資料庫都沒圖，這時候才檢查有沒有 prompt (d)
                    let d = this._resolveAvatarPrompt(name);
                    if (!d) {
                        // 先嘗試 OS_PERSONA 橋接
                        const pf = this._getPersonaFallback(name);
                        if (pf?.url) {
                            url = pf.url;
                            this._avatarMemCache[name] = url;
                        } else if (pf?.prompt) {
                            d = pf.prompt;
                        } else {
                            // 沒有提示詞也沒有任何快取 → 顯示最終 Fallback 剪影立繪（不套頭像框）
                            const fallbackUrl = VN_Config.data.finalFallbackSprite;
                            if (fallbackUrl && img.id !== 'call-avatar') {
                                const portrait = document.getElementById('char-portrait');
                                if (portrait) { portrait.classList.add('no-frame'); this._showEl(portrait, fallbackUrl); }
                            } else if (img.id !== 'call-avatar') {
                                img.style.display = 'none';
                            }
                            return;
                        }
                    }
                    if (!url && !d) return;

                    const raw = await VN_Image.getAvatar(d, this.currentExp);
                    if (!raw) return;
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
                        url = objUrl;
                        this._avatarMemCache[name] = objUrl;
                        if (dataUrl) await VN_Cache.set('avatar_cache', name, { prompt: d, url: dataUrl });
                    } catch(e) {
                        url = await this._toDataUrl(raw);
                        if (url) {
                            this._avatarMemCache[name] = url;
                            await VN_Cache.set('avatar_cache', name, { prompt: d, url });
                        }
                    }
                }
                
                if (!url) {
                    // AI 生成失敗 → 顯示最終 Fallback 剪影立繪（不套頭像框）
                    const fallbackUrl = VN_Config.data.finalFallbackSprite;
                    if (fallbackUrl && img.id !== 'call-avatar') {
                        const portrait = document.getElementById('char-portrait');
                        if (portrait) { portrait.classList.add('no-frame'); this._showEl(portrait, fallbackUrl); }
                    } else {
                        if (img.id !== 'call-avatar') this._hideEl(img);
                        if (img.id === 'game-char') this._hideEl(document.getElementById('char-portrait'));
                    }
                    return;
                }

                if (this.currentName !== name) return; // 角色已切換，放棄顯示

                let targetEl = img;
                if (img.id === 'game-char') {
                    const portrait = document.getElementById('char-portrait');
                    this._showEl(portrait, url);
                    targetEl = portrait;
                } else {
                    if (img.id !== 'call-avatar') this._showEl(img, url); else img.src = url;
                }

                this._applyAvatarAnim(targetEl);
            } finally {
                _resolvePending();
                delete this._pendingAvatars[name];
            }
        },

        _applyAvatarAnim: function(targetEl) {
            const isPortrait = targetEl.id === 'char-portrait';
            const shakeClass = isPortrait ? 'portrait-shake' : 'sprite-shake';
            const jumpClass  = isPortrait ? 'portrait-jumpscare' : 'sprite-jumpscare';
            targetEl.classList.remove(shakeClass, jumpClass);
            void targetEl.offsetWidth;
            if (this.currentExp === 'Surprised') targetEl.classList.add(shakeClass);
            if (this.currentExp === 'JumpScare') targetEl.classList.add(jumpClass);
        }
    };

    /* =========================================
       ⚙ 遊戲內設定
       ========================================= */
    const VN_Settings = {
        defaults: { fontSize: 19, twSpeed: 30, danmuSpeed: 18, bgmVolume: 10, sfxVolume: 50, ttsVolume: 80, textColor: '#dddddd', innerColor: '#c9aaff', nameColor: '#d4af37' },
        data: {},
        load: function() { const saved = localStorage.getItem('vn_game_settings'); this.data = saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults }; this._syncUI(); this._applyAll(); },
        save: function() { localStorage.setItem('vn_game_settings', JSON.stringify(this.data)); },
        _syncUI: function() {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            set('gs-font-size', this.data.fontSize);   setText('gs-font-size-val', this.data.fontSize + 'px');
            set('gs-tw-speed',  this.data.twSpeed);    setText('gs-tw-speed-val',  this.data.twSpeed  + 'ms');
            set('gs-danmu-speed', this.data.danmuSpeed); setText('gs-danmu-speed-val', this.data.danmuSpeed + 's');
            set('gs-bgm-vol',   this.data.bgmVolume);  setText('gs-bgm-vol-val',   this.data.bgmVolume + '%');
            set('gs-sfx-vol',   this.data.sfxVolume);  setText('gs-sfx-vol-val',   this.data.sfxVolume + '%');
            set('gs-tts-vol',   this.data.ttsVolume);  setText('gs-tts-vol-val',   this.data.ttsVolume + '%');
            set('gs-text-color',  this.data.textColor); set('gs-inner-color', this.data.innerColor); set('gs-name-color',  this.data.nameColor);
        },
        _applyAll: function() { this._applyFontSize(this.data.fontSize); this._applyTwSpeed(this.data.twSpeed); this._applyDanmuSpeed(this.data.danmuSpeed); this._applyBgmVol(this.data.bgmVolume); this._applyTtsVol(this.data.ttsVolume); this._applyColors(); },
        _applyFontSize: function(v) { document.getElementById('dialogue-text').style.fontSize = v + 'px'; },
        _applyTwSpeed: function(v) { VN_Core._twSpeed = parseInt(v); },
        _applyDanmuSpeed: function(v) { VN_Core._danmuSpeed = parseInt(v); },
        _applyBgmVol: function(v) { document.getElementById('bgm-player').volume = parseInt(v) / 100; },
        _applyTtsVol: function(v) {
            const vol = parseInt(v) / 100;
            const win = window.parent || window;
            win._vnTtsVolume = vol;   // OS_MINIMAX 播放前會讀取此值
            const el = win.document.getElementById('os-minimax-tts-player');
            if (el) el.volume = vol; // 即時更新正在播放的音量
        },
        _applyColors: function() {
            const root = document.documentElement;
            root.style.setProperty('--text-color', this.data.textColor);
            root.style.setProperty('--em-color',   this.data.innerColor);
            root.style.setProperty('--name-color',  this.data.nameColor);
            // clear any leftover inline styles so CSS vars take effect
            const dt = document.getElementById('dialogue-text');
            const sn = document.getElementById('speaker-name');
            if (dt) dt.style.color = '';
            if (sn) sn.style.color = '';
        },
        applyFontSize: function(v) { this.data.fontSize = parseInt(v); document.getElementById('gs-font-size-val').textContent = v + 'px'; this._applyFontSize(v); this.save(); },
        applyTwSpeed: function(v) { this.data.twSpeed = parseInt(v); document.getElementById('gs-tw-speed-val').textContent = v + 'ms'; this._applyTwSpeed(v); this.save(); },
        applyDanmuSpeed: function(v) { this.data.danmuSpeed = parseInt(v); document.getElementById('gs-danmu-speed-val').textContent = v + 's'; this._applyDanmuSpeed(v); this.save(); },
        applyBgmVol: function(v) { this.data.bgmVolume = parseInt(v); document.getElementById('gs-bgm-vol-val').textContent = v + '%'; this._applyBgmVol(v); this.save(); },
        applySfxVol: function(v) { this.data.sfxVolume = parseInt(v); document.getElementById('gs-sfx-vol-val').textContent = v + '%'; this.save(); },
        applyTtsVol: function(v) { this.data.ttsVolume = parseInt(v); document.getElementById('gs-tts-vol-val').textContent = v + '%'; this._applyTtsVol(v); this.save(); },
        applyTextColor: function(v) { this.data.textColor = v; this._applyColors(); this.save(); },
        applyInnerColor: function(v) { this.data.innerColor = v; this._applyColors(); this.save(); },
        applyNameColor: function(v) { this.data.nameColor = v; this._applyColors(); this.save(); },
        resetColors: function() { this.data.textColor = this.defaults.textColor; this.data.innerColor = this.defaults.innerColor; this.data.nameColor = this.defaults.nameColor; document.getElementById('gs-text-color').value = this.data.textColor; document.getElementById('gs-inner-color').value = this.data.innerColor; document.getElementById('gs-name-color').value = this.data.nameColor; this._applyColors(); this.save(); }
    };

    function openGameSettings() { VN_Settings._syncUI(); document.getElementById('game-settings-overlay').classList.add('active'); }
    function closeGameSettings() { document.getElementById('game-settings-overlay').classList.remove('active'); }

    /* =========================================
       📱 聊天背景面板
       ========================================= */
    async function openChatBgPanel() { await _refreshChatBgThumbs(); document.getElementById('chat-bg-panel').classList.add('active'); }
    function closeChatBgPanel() { document.getElementById('chat-bg-panel').classList.remove('active'); }
    async function _refreshChatBgThumbs() {
        const grid = document.getElementById('chat-bg-grid'); const addBtn = grid.querySelector('.chat-bg-add');
        grid.querySelectorAll('.chat-bg-thumb').forEach(t => t.remove());
        const current = await VN_Cache.get('chat_bg', '_current'); const currentUrl = current ? current.url : '';
        const entries = await VN_Cache.getAll('chat_bg');
        entries.filter(e => e.key !== '_current').forEach(entry => {
            const img = document.createElement('img'); img.className = 'chat-bg-thumb'; img.src = entry.url || '';
            if (entry.url && entry.url === currentUrl) img.classList.add('selected');
            img.onclick = () => _setChatBg(entry.url);
            grid.insertBefore(img, addBtn);
        });
    }
    async function handleChatBgFile(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => { const dataUrl = e.target.result; const key = 'local_' + Date.now(); await VN_Cache.set('chat_bg', key, { url: dataUrl }); await _setChatBg(dataUrl); await _refreshChatBgThumbs(); };
        reader.readAsDataURL(file); input.value = '';
    }
    async function applyChatBgUrl() {
        const url = document.getElementById('chat-bg-url-input').value.trim(); if (!url) return;
        const key = 'url_' + Date.now(); await VN_Cache.set('chat_bg', key, { url }); document.getElementById('chat-bg-url-input').value = ''; await _setChatBg(url); await _refreshChatBgThumbs();
    }
    async function _setChatBg(url) {
        const img = document.getElementById('chat-bg-img'); img.src = url; img.style.display = url ? 'block' : 'none';
        document.getElementById('phone-chat').classList.toggle('has-bg', !!url); await VN_Cache.set('chat_bg', '_current', { url }); closeChatBgPanel();
    }
    async function clearChatBg() {
        const img = document.getElementById('chat-bg-img'); img.src = ''; img.style.display = 'none';
        document.getElementById('phone-chat').classList.remove('has-bg'); await VN_Cache.set('chat_bg', '_current', { url: '' }); closeChatBgPanel();
    }
    async function loadSavedChatBg() {
        const current = await VN_Cache.get('chat_bg', '_current');
        if (current && current.url) { const img = document.getElementById('chat-bg-img'); img.src = current.url; img.style.display = 'block'; document.getElementById('phone-chat').classList.add('has-bg'); }
    }

    /* =========================================
       系統設置：角色快取管理
       ========================================= */
    async function loadAvatarManager(listId) {
        const list = document.getElementById(listId || 'avatar-mgr-list'); if (!list) return;
        const entries = await VN_Cache.getAll('avatar_cache'); list.innerHTML = '';
        if (entries.length === 0) { list.innerHTML = '<div style="color:#666; font-size:0.85rem; padding:15px 0; text-align:center;">尚無快取紀錄（角色首次出現時自動建立）</div>'; return; }
        entries.forEach(entry => {
            const item = document.createElement('div'); item.className = 'avatar-mgr-item';
            const img = document.createElement('img'); img.className = 'avatar-preview'; img.title = entry.key;
            img.onerror = () => { img.style.opacity = '0.25'; img.title = entry.key + '（圖片失效，請重新生成）'; };
            // blob URL 在重開後無效，直接跳過不顯示
            if (entry.url && !entry.url.startsWith('blob:')) {
                img.src = entry.url;
            } else if (entry.url && entry.url.startsWith('blob:')) {
                img.style.opacity = '0.25'; img.title = entry.key + '（快取已過期，請點↺重生成）';
                // 同步清掉無效的 blob URL 記錄，下次打開面板不再顯示
                VN_Cache.delete('avatar_cache', entry.key);
            }
            const info = document.createElement('div'); info.style.cssText = 'flex:1; min-width:0;';
            const nameEl = document.createElement('div'); nameEl.className = 'avatar-mgr-name'; nameEl.textContent = entry.key;
            const textarea = document.createElement('textarea'); textarea.className = 'avatar-mgr-prompt'; textarea.value = entry.prompt || '';
            info.appendChild(nameEl); info.appendChild(textarea);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; flex-shrink:0;';
            const btn = document.createElement('button'); btn.className = 'avatar-regen-btn'; btn.textContent = '↺ 重生成';
            btn.onclick = () => regenerateAvatarEntry(btn, entry.key, textarea, img);
            const delBtn = document.createElement('button'); delBtn.className = 'avatar-del-btn'; delBtn.textContent = '✕ 刪除';
            delBtn.onclick = () => deleteAvatarEntry(entry.key, item, list);
            btnWrap.appendChild(btn); btnWrap.appendChild(delBtn);
            item.appendChild(img); item.appendChild(info); item.appendChild(btnWrap); list.appendChild(item);
        });
    }
    async function regenerateAvatarEntry(btn, name, textarea, previewImg) {
        const prompt = textarea.value.trim(); if (!prompt) return;
        const orig = btn.textContent; btn.textContent = '生成中...'; btn.disabled = true; btn.classList.add('loading');
        try {
            const raw = await VN_Image.getAvatar(prompt, 'Neutral');
            if (raw) {
                // 統一轉 dataUrl 再存 IDB，確保重開後不破圖（NAI 回傳 blob URL 不持久）
                try {
                    const fetchRes = await fetch(raw);
                    const blob = await fetchRes.blob();
                    const dataUrl = await new Promise(r => {
                        const reader = new FileReader();
                        reader.onload = () => r(reader.result);
                        reader.onerror = () => r('');
                        reader.readAsDataURL(blob);
                    });
                    const saveUrl = dataUrl || raw;
                    await VN_Cache.set('avatar_cache', name, { prompt, url: saveUrl });
                    previewImg.src = saveUrl;
                } catch(e) {
                    // fetch 失敗（已是 data: URL 等）→ 直接存
                    await VN_Cache.set('avatar_cache', name, { prompt, url: raw });
                    previewImg.src = raw;
                }
                previewImg.style.opacity = '1';
            }
        } catch(e) { console.error('[VN] regenerateAvatarEntry 失敗', e); }
        btn.textContent = orig; btn.disabled = false; btn.classList.remove('loading');
    }
    async function deleteAvatarEntry(name, itemEl, listEl) {
        await VN_Cache.delete('avatar_cache', name); itemEl.style.transition = 'opacity 0.2s'; itemEl.style.opacity = '0';
        const _empty = '<div style="color:#666; font-size:0.85rem; padding:15px 0; text-align:center;">尚無快取紀錄（角色首次出現時自動建立）</div>';
        setTimeout(() => { itemEl.remove(); const list = listEl || document.getElementById('avatar-mgr-list'); if (list && list.children.length === 0) list.innerHTML = _empty; }, 200);
    }

    /* =========================================
       🔥 終極解析器：嚴格要求 <content> 標籤
       ========================================= */
    async function openChapterPanel() {
        const list = document.getElementById('chapter-list');
        const subheader = document.getElementById('chapter-subheader');
        document.getElementById('chapter-overlay').classList.add('active');

        // 獨立模式：從 OS_DB 讀取本地存檔
        const isStandalone = win.OS_API?.isStandalone?.() ?? false;
        if (isStandalone) {
            list.innerHTML = '<div style="color:#aaa; text-align:center; padding: 25px; font-weight: bold;">讀取本地存檔中...</div>';
            if (subheader) subheader.textContent = '📦 來源: 本地存檔 (IndexedDB)';

            try {
                if (!win.OS_DB) throw new Error('OS_DB 未載入');
                const chapters = await win.OS_DB.getAllVnChapters();
                list.innerHTML = '';

                if (!chapters.length) {
                    list.innerHTML = '<div style="color:#ff453a; text-align:center; padding: 25px; line-height:1.6;">尚無存檔記錄。<br><span style="font-size:0.85rem; color:#aaa;">按「✨ 踏入故事」生成第一章吧！</span></div>';
                    return;
                }

                // 按 storyId 分組（沒有 storyId 的舊資料歸入「舊版資料」群組）
                const groups = {};
                chapters.forEach(ch => {
                    const gid = ch.storyId || '__legacy__';
                    if (!groups[gid]) groups[gid] = { storyTitle: ch.storyTitle || '舊版資料', storyId: ch.storyId || '', chapters: [] };
                    groups[gid].chapters.push(ch);
                });

                // 按各群組最新章節時間排序（最新的故事顯示在上面）
                const sortedGroups = Object.values(groups).sort((a, b) => {
                    const aMax = Math.max(...a.chapters.map(c => c.createdAt || 0));
                    const bMax = Math.max(...b.chapters.map(c => c.createdAt || 0));
                    return bMax - aMax;
                });

                const currentStoryId = window.VN_Core._currentStoryId || '';

                sortedGroups.forEach(group => {
                    const isActive = group.storyId && group.storyId === currentStoryId;
                    const groupId  = 'chgrp_' + Math.random().toString(36).slice(2, 8);
                    const maxTime  = Math.max(...group.chapters.map(c => c.createdAt || 0));
                    
                    // 1. 資料夾顯示完整的 日期 + 時間 (例如：04/16 下午01:30)
                    const dateStr  = maxTime ? new Date(maxTime).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

                    // ── 資料夾標題列 ──
                    const header = document.createElement('div');
                    header.className = 'ch-story-header' + (isActive ? ' active' : '');
                    header.innerHTML = `
                        <span class="ch-story-arrow">${isActive ? '▼' : '▶'}</span>
                        <span class="ch-story-title">${group.storyTitle}</span>
                        <span class="ch-story-meta">${dateStr}${dateStr ? ' · ' : ''}${group.chapters.length} 章</span>
                        <button class="ch-story-del" title="刪除整個劇情">🗑️</button>
                    `;

                    // ── 章節容器（預設：當前故事展開，其他折疊）──
                    const body = document.createElement('div');
                    body.id = groupId;
                    body.className = 'ch-story-body';
                    body.style.display = isActive ? 'block' : 'none';

                    // 折疊 / 展開
                    header.onclick = (e) => {
                        if (e.target.classList.contains('ch-story-del')) return;
                        const open = body.style.display !== 'none';
                        body.style.display = open ? 'none' : 'block';
                        header.querySelector('.ch-story-arrow').textContent = open ? '▶' : '▼';
                    };

                    // 刪除整個故事
header.querySelector('.ch-story-del').onclick = async (e) => {
    e.stopPropagation();
    const sid = group.storyId;
    if (!confirm(`確定刪除「${group.storyTitle}」的所有章節？\n（開場白預設不受影響）`)) return;
    if (sid) {
        // 1. 刪除資料庫裡的章節
        await win.OS_DB.deleteVnChaptersByStoryId(sid);
        
        // ✨ 2. 新增這兩行：同步清除遺留在 localStorage 的 AVS 變數與回朔快照
        localStorage.removeItem(`avs_state_${sid}`);
        localStorage.removeItem(`avs_snap_${sid}`);

        if (sid === window.VN_Core._currentStoryId) {
            window.VN_Core._setStoryId('', '');
        }
    } else {
        // 舊版無 storyId 資料，逐條刪除
        for (const ch of group.chapters) await win.OS_DB.deleteVnChapter(ch.id);
    }
    header.remove();
    body.remove();
};

                    // 2. 章節強制按時間「升序」（舊到新：第一章在最上面）
                    group.chapters.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

                    // ── 各章節 ──
                    group.chapters.forEach(ch => {
                        const item = document.createElement('div');
                        item.className = 'ch-item';
                        // 移除單獨時間，並增加右側 padding 避免標題太長壓到刪除鈕
                        item.style.cssText = 'position:relative; padding-right: 50px;';
                        item.innerHTML = `
                            <span class="ch-name">${ch.title}</span>
                            <button style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(200,50,50,.15);border:1px solid rgba(200,50,50,.3);color:#e06060;border-radius:4px;padding:2px 8px;font-size:0.75rem;cursor:pointer;" data-id="${ch.id}">刪</button>
                        `;
                        // 點擊載入
                        item.onclick = (e) => {
                            if (e.target.dataset.id) return;
                            window.VN_Core._setStoryId(ch.storyId || '', ch.storyTitle || '');
                            switchPage('page-game');
                            closeChapterPanel();
                            // 走 _loadWithSceneAnalysis：若場景插圖已啟用，先送副模型分析再播放
                            window.VN_Core._showStartLoader(4000, () => window.VN_Core._loadWithSceneAnalysis(ch.content, null));
                        };
                        // 刪除單章
                        item.querySelector('button[data-id]').onclick = async (e) => {
                            e.stopPropagation();
                            if (!confirm(`確定刪除「${ch.title}」？`)) return;
                            await win.OS_DB.deleteVnChapter(ch.id);
                            item.remove();
                            // 更新章數顯示
                            const remaining = body.querySelectorAll('.ch-item').length;
                            header.querySelector('.ch-story-meta').textContent = `${dateStr}${dateStr ? ' · ' : ''}${remaining} 章`;
                            // 整組都刪完了就移除資料夾
                            if (remaining === 0) { header.remove(); body.remove(); }
                        };
                        body.appendChild(item);
                    });

                    list.appendChild(header);
                    list.appendChild(body);
                });

            } catch(e) {
                console.error('[VN_PLAYER] 讀取本地存檔失敗:', e);
                list.innerHTML = `<div style="color:#ff453a; text-align:center; padding: 25px;">讀取失敗: ${e.message}</div>`;
            }
            return;
        }

        // 酒館模式：從 ST 聊天歷史讀取
        list.innerHTML = '<div style="color:#aaa; text-align:center; padding: 25px; font-weight: bold;">讀取酒館實時數據中...</div>';
        if (subheader) subheader.textContent = '🌐 來源: 酒館 AI 實時數據庫';

        try {
            const helper = win.TavernHelper;
            if (!helper) throw new Error("TavernHelper 未載入");

            const lastId = helper.getLastMessageId();
            const allMsgs = helper.getChatMessages(`0-${lastId}`, { role: 'assistant' });

            let chapters = [];
            let index = 1;

            allMsgs.forEach(m => {
                const text = m.message || "";
                if (!text.includes('<content>')) return;

                let chTitle = `對話紀錄 ${index}`;
                const chMatch = text.match(/\[Chapter\|(?:\d+\|)?([^\]|]+)\]/i);
                const storyMatch = text.match(/\[Story\|([^\]]+)\]/i);
                if (chMatch) chTitle = chMatch[1].trim();
                else if (storyMatch) chTitle = storyMatch[1];

                chapters.push({ title: chTitle, content: text, index: index++, message_id: m.message_id });
            });

            list.innerHTML = '';

            if (chapters.length === 0) {
                list.innerHTML = '<div style="color:#ff453a; text-align:center; padding: 25px; line-height:1.6;">未在當前聊天中讀取到包含 &lt;content&gt; 標籤的劇情！<br><span style="font-size:0.85rem; color:#aaa;">(用戶的輸入或不符格式的對話已被自動過濾)</span></div>';
                return;
            }

            chapters.forEach(ch => {
                const item = document.createElement('div');
                item.className = 'ch-item tavern-parse';
                item.innerHTML = `<span class="ch-name">${ch.title}</span><span class="ch-num">CH.${String(ch.index).padStart(2, '0')}</span><span class="ch-msgid">#${ch.message_id}</span>`;
                item.onclick = () => {
                    window.VN_Core.loadScript(ch.content, ch.message_id);
                    switchPage('page-game');
                    closeChapterPanel();
                    window.VN_Core.next();
                };
                list.appendChild(item);
            });

        } catch (e) {
            console.error('[VN_PLAYER] 讀取酒館歷史失敗:', e);
            list.innerHTML = `<div style="color:#ff453a; text-align:center; padding: 25px;">讀取失敗: ${e.message}</div>`;
        }
    }

    function closeChapterPanel() {
        document.getElementById('chapter-overlay').classList.remove('active');
        const pageGame = document.getElementById('page-game');
        if (pageGame && pageGame.classList.contains('hidden')) {
            if (window.AureliaControlCenter?.hideVnPanel) window.AureliaControlCenter.hideVnPanel();
        }
    }

    // === 4. 全域 UI 輔助函數 ===
    // === 主頁背景輪播 ===
    let _homeBgTimer    = null;
    let _homeBgPool     = [];
    let _homeBgIdx      = 0;
    // 遊戲中出現過的背景原始 URL（不隨 resetState 清除，跨回合持久）
    const _sessionBgRawUrls = {};

    function _setHomeBg(url) {
        const pg = document.getElementById('page-home');
        if (pg) pg.style.backgroundImage = url ? `url('${url}')` : 'none';
    }

    function _stopHomeBgTimer() {
        if (_homeBgTimer) { clearInterval(_homeBgTimer); _homeBgTimer = null; }
    }

    async function applyRandomHomeBg() {
        _stopHomeBgTimer();
        const base  = VN_Config.data.homeBgBase;
        const count = parseInt(VN_Config.data.homeBgCount) || 0;
        const ext   = VN_Config.data.homeBgExt || 'jpg';

        if (base && count > 0) {
            let currentIdx = Math.floor(Math.random() * count) + 1;
            const getNextUrl = () => {
                const url = base.endsWith('/') ? `${base}${currentIdx}.${ext}` : `${base}/${currentIdx}.${ext}`;
                currentIdx++;
                if (currentIdx > count) currentIdx = 1;
                return url;
            };
            
            _setHomeBg(getNextUrl());
            
            if (count > 1) {
                _homeBgTimer = setInterval(() => {
                    _setHomeBg(getNextUrl());
                }, 10000); 
            }
            return;
        }

        const sessionUrls = Object.values(_sessionBgRawUrls).filter(Boolean);
        if (sessionUrls.length > 0) {
            _homeBgPool = [...sessionUrls];
            _homeBgPool.sort(() => Math.random() - 0.5);
            _homeBgIdx = 0;
            _setHomeBg(_homeBgPool[0]);
            if (_homeBgPool.length > 1) {
                _homeBgTimer = setInterval(() => {
                    _homeBgIdx = (_homeBgIdx + 1) % _homeBgPool.length;
                    _setHomeBg(_homeBgPool[_homeBgIdx]);
                }, 10000);
            }
            return;
        }

        const entries = await VN_Cache.getAll('bg_cache');
        _homeBgPool = entries.map(e => e.rawUrl || e.url).filter(Boolean);
        if (_homeBgPool.length === 0) { _setHomeBg(null); return; }

        _homeBgPool.sort(() => Math.random() - 0.5);
        _homeBgIdx = 0;
        _setHomeBg(_homeBgPool[0]);

        if (_homeBgPool.length > 1) {
            _homeBgTimer = setInterval(() => {
                _homeBgIdx = (_homeBgIdx + 1) % _homeBgPool.length;
                _setHomeBg(_homeBgPool[_homeBgIdx]);
            }, 10000);
        }
    }

    function switchPage(id) {
        _stopHomeBgTimer();
        document.querySelectorAll('.page').forEach(e => e.classList.add('hidden'));
        const target = document.getElementById(id);
        if (target) target.classList.remove('hidden');
        if (id !== 'page-game') { const bgm = document.getElementById('bgm-player'); if (bgm) { bgm.pause(); bgm.currentTime = 0; } }
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

    // === 4.5 VN_Sticker 表情包模組 ===
    const VN_Sticker = {
        // lib 結構: { id, name, baseUrl, stickers:[{name, file}] }
        // file = 檔名（如 IMG-5034.gif），完整 URL = baseUrl + file
        // 若 file 本身已是完整 URL (https://...) 則直接用
        _libs: [],
        _currentLib: null,
        _panelOpen: false,

        init() {
            try { this._libs = JSON.parse(localStorage.getItem('vn_sticker_libs') || '[]'); } catch(e) { this._libs = []; }
            this._currentLib = this._libs[0]?.id || null;
            this.renderTabs();
            this.renderSettingsLibs();
            if (this._currentLib) this.renderGrid(this._currentLib);
        },

        _save() { localStorage.setItem('vn_sticker_libs', JSON.stringify(this._libs)); },

        // 取完整 URL：file 若已是完整 URL 直接返回，否則拼 baseUrl
        _resolveUrl(lib, file) {
            if (!file) return '';
            if (/^https?:\/\//i.test(file)) return file;
            const base = (lib.baseUrl || '').replace(/\/?$/, '/');
            return base + file;
        },

        // 解析 TXT，value 可以是檔名或完整 URL
        _parseText(text) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            let libName = '表情包';
            const stickers = [];
            lines.forEach((line, i) => {
                if (i === 0 && line.startsWith('library:')) { libName = line.slice(8).trim(); return; }
                const sep = line.indexOf(':');
                if (sep > 0) {
                    const name = line.slice(0, sep).trim();
                    const file = line.slice(sep + 1).trim();
                    if (name && file) stickers.push({ name, file });
                }
            });
            return { name: libName, stickers };
        },

        // 方式一：URL → fetch TXT 內容 → 建庫（onblur，不需按鈕）
        async addLibFromUrl(val) {
            const url = val.trim();
            if (!url) return;
            const statusEl = document.getElementById('stk-url-status');
            if (statusEl) { statusEl.textContent = '載入中...'; statusEl.style.color = '#aaa'; }
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                const data = this._parseText(text);
                const baseUrl = url.replace(/\/[^\/]*$/, '/');
                // 若已有同 sourceUrl 就更新
                const existing = this._libs.find(l => l.sourceUrl === url);
                if (existing) {
                    existing.name = data.name; existing.stickers = data.stickers;
                    this._currentLib = existing.id;
                } else {
                    const id = 'lib_' + Date.now();
                    this._libs.push({ id, name: data.name, baseUrl, stickers: data.stickers, sourceUrl: url });
                    this._currentLib = id;
                }
                this._save(); this.renderSettingsLibs(); this.renderTabs(); this.renderGrid(this._currentLib);
                if (statusEl) { statusEl.textContent = `✓ 已載入 ${data.stickers.length} 張`; statusEl.style.color = '#2ecc71'; }
            } catch(e) {
                if (statusEl) { statusEl.textContent = `✗ 失敗：${e.message}`; statusEl.style.color = '#e74c3c'; }
            }
        },

        // 庫列表行內 URL 自動存
        updateLibBaseUrl(id, val) {
            const lib = this._libs.find(l => l.id === id);
            if (!lib) return;
            lib.baseUrl = val.trim().replace(/\/?$/, val.trim() ? '/' : '');
            this._save();
        },

        // 設置頁：上傳 TXT，套用到當前庫（或建新庫）
        importFromFile(inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = this._parseText(e.target.result);
                if (this._currentLib) {
                    // 更新當前庫的名稱和貼圖列表
                    const lib = this._libs.find(l => l.id === this._currentLib);
                    if (lib) { lib.name = data.name; lib.stickers = data.stickers; }
                } else {
                    // 沒有當前庫，建新庫（無 baseUrl）
                    const id = 'lib_' + Date.now();
                    this._libs.push({ id, name: data.name, baseUrl: '', stickers: data.stickers });
                    this._currentLib = id;
                }
                this._save();
                this.renderSettingsLibs();
                this.renderTabs();
                this.renderGrid(this._currentLib);
            };
            reader.readAsText(file, 'utf-8');
            inputEl.value = '';
        },

        deleteLib(id) {
            this._libs = this._libs.filter(l => l.id !== id);
            if (this._currentLib === id) this._currentLib = this._libs[0]?.id || null;
            this._save(); this.renderSettingsLibs(); this.renderTabs();
            const grid = document.getElementById('sticker-grid');
            if (this._currentLib) this.renderGrid(this._currentLib);
            else if (grid) grid.innerHTML = '';
        },

        // 查找貼圖：用名字或檔名查，返回完整 URL
        lookup(name) {
            const key = name.replace(/\.(gif|jpg|jpeg|png)$/i, '').toLowerCase();
            for (const lib of this._libs) {
                for (const s of lib.stickers) {
                    if (s.name.toLowerCase() === key || s.file.replace(/\.(gif|jpg|jpeg|png)$/i,'').toLowerCase() === key)
                        return this._resolveUrl(lib, s.file);
                }
                // fallback：若有 baseUrl，直接用名字+副檔名嘗試
                if (lib.baseUrl && name.match(/\.(gif|jpg|jpeg|png)$/i))
                    return this._resolveUrl(lib, name);
            }
            return null;
        },

        togglePanel() { this._panelOpen ? this.closePanel() : this.openPanel(); },

        openPanel() {
            const p = document.getElementById('sticker-panel');
            if (!p) return;
            p.classList.add('open');
            this._panelOpen = true;
            this.renderTabs();
            if (this._currentLib) this.renderGrid(this._currentLib);
        },

        closePanel() {
            const p = document.getElementById('sticker-panel');
            if (p) p.classList.remove('open');
            this._panelOpen = false;
        },

        switchLib(id) { this._currentLib = id; this.renderTabs(); this.renderGrid(id); },

        renderTabs() {
            const el = document.getElementById('sticker-tabs');
            if (!el) return;
            el.innerHTML = this._libs.map(lib =>
                `<button class="sticker-tab${lib.id === this._currentLib ? ' active' : ''}" onclick="window.VN_Sticker.switchLib('${lib.id}')">${lib.name}</button>`
            ).join('');
        },

        renderGrid(id) {
            const lib = this._libs.find(l => l.id === id);
            const grid = document.getElementById('sticker-grid');
            if (!grid) return;
            if (!lib || !lib.stickers.length) {
                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#aaa;font-size:0.8rem;padding:20px;">尚無表情包，請至系統設置匯入</div>`; return;
            }
            grid.innerHTML = lib.stickers.map(s => {
                const url = this._resolveUrl(lib, s.file);
                const safeUrl = url.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div class="sticker-item" title="${s.name}" onclick="window.VN_Sticker.sendSticker('${s.name}','${safeUrl}')"><img src="${url}" alt="${s.name}" loading="lazy" onerror="this.parentNode.style.opacity='0.3'"></div>`;
            }).join('');
        },

        renderSettingsLibs() {
            const el = document.getElementById('sticker-mgr-list');
            if (!el) return;
            if (!this._libs.length) { el.innerHTML = `<div style="color:#666;font-size:0.8rem;">尚無表情包庫</div>`; return; }
            el.innerHTML = this._libs.map(lib =>
                `<div class="stk-lib-row">
                    <div class="stk-lib-top">
                        <span class="stk-lib-name">${lib.name}</span>
                        <span class="stk-lib-count">${lib.stickers.length} 張</span>
                        <button class="stk-lib-del" onclick="window.VN_Sticker.deleteLib('${lib.id}')">✕</button>
                    </div>
                    <input class="stk-lib-url-input" type="text" placeholder="圖片資料夾 URL（選填）"
                        value="${lib.baseUrl || ''}"
                        oninput="window.VN_Sticker.updateLibBaseUrl('${lib.id}', this.value)">
                </div>`
            ).join('');
        },

        sendSticker(name, url) {
            const chatBody = document.getElementById('chat-body');
            if (!chatBody || !window.VN_Phone) return;
            const me = window.VN_Phone.chatParticipants?.[0] || '我';
            chatBody.innerHTML += window.VN_Phone._buildChatBubbleHTML(me, `[表情包:${url}]`, true, window.VN_Core);
            window.VN_Phone.scrollChat();
            this.closePanel();
        },
    };

    // === 5. 導出到 Window ===
    window.VN_Core = VN_Core;
    window.VN_Config = VN_Config;
    window.VN_Sticker = VN_Sticker;
    window.VN_Settings = VN_Settings;
    // ================================================================
    // === VN 獨立 API 生成模組 ===
    // ================================================================
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
                <div style="font-size:17px;font-weight:900;color:#FBDFA2;letter-spacing:3px;">${_esc(w.title)}</div>
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
                            'background:rgba(212,175,55,0.12);color:#FBDFA2;font-size:12px;'
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
                switchPage('page-game');
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
                            const _thinking = win.OS_THINK?.getLatest()?.content?.trim() || '';
                            
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
                        switchPage('page-game');
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

    // ================================================================
    // === 獨立模式：存檔/角色/錢包 查閱面板 ===
    // ================================================================
    const VN_StandaloneArchive = {
        _pendingChoices: null,  // [Choice|] 帶入的選項陣列
        _choiceCallback: null,  // 選項選定後的回調
        show() {
            this._injectCss();
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
            this._addTab(tabBar, contentArea, 'profiles', '📜 本章角色', await this._profilesHtml(), !hasChoices);
            this._addTab(tabBar, contentArea, 'avs',      '📊 狀態',      await this._avsHtml(),       false);
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

        async _profilesHtml() {
            // 掃描所有章節，解析 <profile> 表格（舊式）與 <summary> char_new:（新式）
            if (!win.OS_DB?.getAllVnChapters) return '<div style="padding:30px;text-align:center;color:#999">OS_DB 未載入</div>';
            try {
                const allChapters = await win.OS_DB.getAllVnChapters();
                const currentStoryId = window.VN_Core?._currentStoryId || '';
                const chapters = currentStoryId
                    ? allChapters.filter(ch => ch.storyId === currentStoryId)
                    : allChapters.filter(ch => !ch.storyId);
                // 從舊到新，後出現同名角色不覆蓋（首次登場原則）
                const allChars = {}; // name → { headers, cells }
                const _stdHeaders = ['名字', '身份', '性格', '外觀描述', '頭像提示詞'];
                chapters.slice().reverse().forEach(ch => {
                    const content = ch.content || '';
                    // ── 舊式 <profile> 表格 ──
                    const profReg = /<profile>([\s\S]*?)<\/profile>/gi; let pm;
                    while ((pm = profReg.exec(content)) !== null) {
                        const rows = pm[1].split('\n').filter(l => l.trim().startsWith('|'));
                        let headers = null;
                        for (const row of rows) {
                            const cells = row.split('|').map(c => c.trim()).filter(c => c);
                            if (!cells.length) continue;
                            if (cells.every(c => /^:?-+:?$/.test(c))) continue;
                            if (!headers) { headers = cells; continue; }
                            const name = cells[0]?.trim();
                            if (name && !allChars[name]) allChars[name] = { headers, cells };
                        }
                    }
                    // ── 新式 <summary> char_new: ──
                    const smReg = /<summary>([\s\S]*?)<\/summary>/gi; let sm;
                    while ((sm = smReg.exec(content)) !== null) {
                        for (const line of sm[1].split('\n')) {
                            const cnMatch = line.match(/char_new\s*[:：]\s*([^|]+)\|(.+)/);
                            if (!cnMatch) continue;
                            const name = cnMatch[1].trim();
                            if (!name || allChars[name]) continue;
                            const kvStr = cnMatch[2];
                            const get = key => (kvStr.match(new RegExp(`${key}\\s*=\\s*([^|]+)`)) || [])[1]?.trim() || '—';
                            allChars[name] = {
                                headers: _stdHeaders,
                                cells: [name, get('身份'), get('性格'), get('外觀'), get('頭像')]
                            };
                        }
                    }
                });
                const keys = Object.keys(allChars);
                if (!keys.length) return `<div style="padding:30px;text-align:center;color:#999">
                    <div style="font-size:36px;margin-bottom:8px">📭</div>
                    尚無角色資料。生成劇情後，AI 在摘要中的 char_new: 資料會累積於此。</div>`;
                return keys.map(name => {
                    const { headers, cells } = allChars[name];
                    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    const rows = headers.map((h, i) => {
                        if (i === 0) return ''; // 名字欄已作標題
                        const val = cells[i] || '—';
                        return `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                            <span style="color:#666;font-size:11px;min-width:60px;flex-shrink:0;">${esc(h)}</span>
                            <span style="color:#aaa;font-size:11px;line-height:1.5;">${esc(val)}</span>
                        </div>`;
                    }).join('');
                    return `<div style="margin-bottom:14px;padding:12px 14px;background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.15);border-radius:6px;">
                        <div style="font-size:13px;color:#d4af37;font-weight:bold;margin-bottom:8px;letter-spacing:1px;">👤 ${esc(name)}</div>
                        ${rows}
                    </div>`;
                }).join('');
            } catch(e) { return `<div style="padding:20px;color:#e74c3c">讀取失敗: ${e.message}</div>`; }
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
                for (const tpl of activeTpls) {
                    let html = tpl.htmlContent || '';
                    let css  = tpl.cssContent  || '';
                    Object.entries(state).forEach(([k, v]) => {
                        const re = new RegExp(`\\{\\{${k}\\}\\}`, 'g');
                        html = html.replace(re, String(v));
                    });
                    html = html.replace(/\{\{[\w.]+\}\}/g, '—');
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

            return `<div id="avs-tab-root" data-story="${storyId}" data-last-ch="${lastChapter?.id || ''}">
                ${rerollBtn}
                ${panelHtml}
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

        _injectCss() {
            if (document.getElementById('ue-styles-v12-0') || document.getElementById('vn-sa-css')) return;
            const s = document.createElement('style');
            s.id = 'vn-sa-css';
            s.textContent = `
                #aurelia-extractor-phone-overlay{position:absolute;top:0;left:0;width:100%;height:100%;z-index:9999;background:#080604;background-size:cover;background-position:center;transform:translateY(100%);transition:transform 0.4s cubic-bezier(.22,1,.36,1);display:flex;flex-direction:column;overflow:hidden}
                #aurelia-extractor-phone-overlay::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.74) 0%,rgba(0,0,0,.88) 55%,rgba(0,0,0,.94) 100%);z-index:0;pointer-events:none}
                #aurelia-extractor-phone-overlay.show{transform:translateY(0)}
                #ue-root-wrapper{position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;color:#e8dfc8;font-family:'Noto Serif TC',serif;box-sizing:border-box}
                #ue-toolbar{display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px)) 16px 0;background:rgba(5,4,2,.55);backdrop-filter:blur(14px);border-bottom:1px solid rgba(212,175,55,.22);flex-shrink:0;min-height:52px;height:calc(52px + env(safe-area-inset-top,0px))}
                .ue-title{font-weight:700;font-size:13px;color:#d4af37;letter-spacing:4px;text-transform:uppercase}
                .ue-icon-btn{border:none;background:transparent;cursor:pointer;font-size:17px;color:rgba(212,175,55,.5);transition:all .18s;width:34px;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center}
                .ue-icon-btn:hover{color:#d4af37;background:rgba(212,175,55,.1)}
                #ue-tab-bar{display:flex;gap:0;padding:0 12px;background:rgba(3,2,1,.5);backdrop-filter:blur(10px);border-bottom:1px solid rgba(212,175,55,.14);overflow-x:auto;flex-shrink:0}
                #ue-tab-bar::-webkit-scrollbar{display:none}
                .ue-tab-item{padding:11px 14px;font-size:10px;color:rgba(200,178,130,.45);cursor:pointer;border-bottom:2px solid transparent;transition:all .18s;white-space:nowrap;font-weight:600;letter-spacing:2px}
                .ue-tab-item.active{color:#d4af37;border-bottom-color:#d4af37}
                #ue-content-area{flex:1;overflow-y:auto;overflow-x:hidden;background:transparent;padding:0;display:flex;flex-direction:column;}
                #ue-content-area::-webkit-scrollbar{width:3px}
                #ue-content-area::-webkit-scrollbar-thumb{background:rgba(212,175,55,.28);border-radius:2px}
                .ue-tab-pane{display:none;}
                .ue-tab-pane.active{display:flex;flex-direction:column;flex:1;padding:16px;box-sizing:border-box;}
                .native-render-wrapper{color:#e8dfc8;display:flow-root;width:100%}
                .ue-md-table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}
                .ue-md-table th{background:rgba(212,175,55,.12);color:#d4af37;padding:7px 10px;text-align:left;border-bottom:1px solid rgba(212,175,55,.3);font-size:11px}
                .ue-md-table td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.06);color:#e8dfc8;vertical-align:top}
                .ue-controls{display:flex;gap:4px;align-items:center}`;
            document.head.appendChild(s);
        }
    };
    window.VN_StandaloneArchive = VN_StandaloneArchive;

    window.VN_PLAYER = {
        launchApp,
        switchPage, stopGame, openChapterPanel, closeChapterPanel,
        openGameSettings, closeGameSettings, openChatBgPanel, closeChatBgPanel, handleChatBgFile,
        applyChatBgUrl, clearChatBg,
        openGeneratePanel, closeGeneratePanel, generateStory, diveSelectedCard,
        resetPromptOrder() { VN_PromptOrder.reset(); },
        loadAvatarManager,   // 供 vn_settings.js 外接調用（接受自定義 listId）

        // 💭 本章思考鏈小窗
        showThinkPopup() {
            const popup = document.getElementById('vn-think-popup');
            if (!popup) return;
            if (popup.classList.contains('active')) { popup.classList.remove('active'); return; }
            const body = document.getElementById('vn-think-popup-body');
            // OS_THINK.log 最新一筆（entries.unshift，index 0 = 最新）
            const lastEntry = win.OS_THINK?.getLatest();
            const thinkContent = lastEntry?.content?.trim() || '';
            body.innerHTML = thinkContent
                ? thinkContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
                : '<div class="think-empty-msg">本章無思考記錄<br><small>（需啟用 enable_thinking 且 AI 支援）</small></div>';
            popup.classList.add('active');
        },
        hideThinkPopup() {
            document.getElementById('vn-think-popup')?.classList.remove('active');
        },

        // 📖 劇情閱讀器
        async showReaderPanel() {
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
                s = s.replace(/<profile>[\s\S]*?<\/profile>/gi, '');
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
            document.getElementById('vn-reader-overlay')?.classList.remove('active');
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