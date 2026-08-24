'use strict';
// VN_TTS — 專屬 VN 擴展的輕量 GPT-SoVITS TTS 引擎
// 直連 GPT-SoVITS HTTP API，無需依賴 SillyTavern-GPT-SoVITS 擴展
(function () {

const VN_TTS = {
    CONFIG_KEY: 'vn_tts_v1',

    config: {
        enabled:   false,
        serverUrl: 'http://127.0.0.1:9880',
        stRoot:    '',   // SillyTavern 根目錄，如 D:\SillyTavern（掃描 models/ 用）
        textLang:  'zh',
        volume:    0.8,
        
        // 預設的情緒靈魂參數
        speed:        1,
        topK:         15,
        topP:         1,
        temperature:  1,

        // V3/V4 Flow Matching 專屬：推理步數（4–100，越高越好但越慢；V1/V2 忽略此值）
        sampleSteps:  32,

        // 模型庫: id → { name, gptPath, sovitsPath, refAudioPath, refText, refLang, emotions: {...} }
        models: {},

        // 角色對應: charName → modelId
        charMappings: {},

        // 系統語音對應: 系統名 → modelId（[Sys|系統名|訊息] 用；空字串 key = 預設系統音）
        systemMappings: {},

        // 旁白音色: modelId（SoVITS 旁白；指派了才念，空＝不念）
        narratorModel: '',

        // 旁白用 Kokoro 引擎（獨立小服務、OpenAI 相容；不碰 SoVITS GPU 佇列；enabled 時優先於 narratorModel）
        narratorKokoro: { enabled: false, url: 'http://127.0.0.1:8880', voice: 'zf_xiaoxiao' },

        // 旁白用 MiniMax（雲端，只要 API key、免本地；給不會弄電腦的朋友。enabled 時優先於 SoVITS narratorModel）
        narratorMinimax: { enabled: false, voice: 'audiobook_female_1' },

        // IndexTTS 的語氣強度（0~1，音色可用 emoAlpha 個別覆寫）。
        //   實測 0.5 是甜蜜點：音高起伏 +18%、音域 +22%，而說話音高只升 2.3 半音（還是同一個人）。
        //   往上就開始變成另一個人：專屬情緒音檔 1.0 升 6.5 半音，情緒權重對低沉的聲音更兇
        //   （118Hz 的音色 1.0 會升到 251Hz，等於升 13 個半音，而且起伏反而掉）。
        indexEmoAlpha: 0.5,

        // 旁白用 IndexTTS（本機獨立服務、OpenAI 相容；音色＝丟一段參考音檔就好，不用練模型）
        //   voice 可帶情緒：'丹' 或 '丹:Angry'
        narratorIndex: { enabled: false, url: 'http://127.0.0.1:8881', voice: '', speed: 1 },

        // 角色別名: 主名 → [別名1, 別名2, ...]（不分大小寫匹配，AI 用全名/小名都能對到同一個模型）
        charAliases: {},

        // NPC 分類: [{ id, name, tags:[], modelIds:[] }]
        npcCategories: [],

        // 🔒 本卡 NPC 聲線鎖: cardId → { charName: modelId }
        //   來源＝立繪雙擊「💾 保存 CV」（隨手鎖住某張卡裡某個 NPC 的音）。與「charMappings(使用者手填、全域、面板顯示)」分流：
        //   不進面板、按角色卡 id 收著、換卡自動回歸抽池、同卡重玩還在。
        npcLocks: {}
    },

    // 執行期狀態（不持久化）
    _cache:          {},        // cacheKey → blob URL
    _pending:        new Set(), // cacheKeys 正在生成中
    _prewarmQueue:   [],
    _prewarmRunning: false,
    _currentAudio:   null,
    _currentMsUrl:   null,
    _loadedGpt:      null,     // 目前 GPU 上的模型路徑
    _loadedSovits:   null,
    _oggSupported:   null,
    _npcSessionCache:{},       // 🎭 新增：記錄這局對話中，NPC 已經抽到的聲音 (charName → modelId)

    // ── 初始化 ─────────────────────────────────────────────────────────
    init() {
        try {
            const s = localStorage.getItem(this.CONFIG_KEY);
            if (s) {
                const saved = JSON.parse(s);
                Object.assign(this.config, saved);
                if (!this.config.models)         this.config.models = {};
                if (!this.config.charMappings)   this.config.charMappings = {};
                if (!this.config.systemMappings) this.config.systemMappings = {};
                if (!this.config.narratorKokoro) this.config.narratorKokoro = { enabled:false, url:'http://127.0.0.1:8880', voice:'zf_xiaoxiao' };
                if (!this.config.narratorMinimax) this.config.narratorMinimax = { enabled:false, voice:'audiobook_female_1' };
                if (!this.config.narratorIndex)  this.config.narratorIndex = { enabled:false, url:'http://127.0.0.1:8881', voice:'', speed:1 };
                if (!this.config.npcCategories)  this.config.npcCategories = [];
                if (!this.config.npcLocks)       this.config.npcLocks = {};
            }
        } catch (e) {}
        console.log('[VN_TTS] 初始化, 啟用:', this.config.enabled);
    },

    save() {
        localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
    },

    // ── 本卡 NPC 聲線鎖（按穩定角色卡 id；與全域 charMappings 分流）──────────
    // 穩定卡 id：優先角色卡檔名(avatar)＞群組 id＞聊天名去掉「 - 時間戳」。同卡重玩=同 id。
    _cardId() {
        try {
            const w = window.parent || window;
            const ctx = w.SillyTavern && w.SillyTavern.getContext && w.SillyTavern.getContext();
            if (ctx) {
                const chid = ctx.characterId;
                if (chid != null && ctx.characters && ctx.characters[chid] && ctx.characters[chid].avatar) return 'char::' + String(ctx.characters[chid].avatar);
                if (ctx.groupId) return 'group::' + String(ctx.groupId);
                if (ctx.chatId) return 'chat::' + String(ctx.chatId).replace(/\s*-\s*\d{4}-\d{2}-\d{2}@.*$/, '').trim();
            }
        } catch(e){}
        return 'card_default';
    },
    _cardLocks() {
        const id = this._cardId();
        if (!this.config.npcLocks) this.config.npcLocks = {};
        if (!this.config.npcLocks[id]) this.config.npcLocks[id] = {};
        return this.config.npcLocks[id];
    },
    lockNpcVoice(charName, modelId) {
        if (!charName || !modelId) return;
        this._cardLocks()[charName] = modelId;
        this.save();
    },
    unlockNpcVoice(charName) {
        const locks = this._cardLocks();
        if (locks[charName]) { delete locks[charName]; this.save(); }
    },
    clearCardLocks() {
        const id = this._cardId();
        if (this.config.npcLocks && this.config.npcLocks[id]) { this.config.npcLocks[id] = {}; this.save(); }
    },

    // ── 能力偵測 ────────────────────────────────────────────────────────
    _canStreamOgg() {
        if (this._oggSupported !== null) return this._oggSupported;
        try {
            this._oggSupported = !!window.MediaSource &&
                MediaSource.isTypeSupported('audio/ogg; codecs=vorbis');
        } catch (e) { this._oggSupported = false; }
        return this._oggSupported;
    },

    // ── 工具 ────────────────────────────────────────────────────────────
    cleanText(t) {
        return (t || '')
            .replace(/^[。，、…‥「」『』【】〔〕！？!?,\s]+/, '') // 開頭的標點依然可以去掉
            .replace(/[。，、「」『』【】〔〕,\s]+$/, '') // 🌟 結尾過濾：拿掉了 ！？!? 和 … ‥ ，讓語氣保留！
            .replace(/[,，]/g, ' ') 
            .replace(/\s+/g, ' ')   
            .trim();
    },

    // Kokoro 用：保留逗號/句號（它靠標點抓停頓），只收斂空白 —— 不要拿 cleanText（那會把逗號拔掉給 SoVITS 不喘用）
    _cleanForKokoro(t) {
        return String(t || '').replace(/\s+/g, ' ').trim();
    },

    _cacheKey(modelId, text) { return `${modelId}\x00${text}`; },

    // 🔬 診斷（預設關）：印出語音快取命中/現生/換模型/預熱耗時。
    //    要查語音問題時把 === '1' 改成 !== '0' 就會預設開（TauriTavern 沒 console，改碼比設 localStorage 快）。
    _trace() { try { return localStorage.getItem('aurelia_gpu_trace') === '1'; } catch (e) { return false; } },


    // 收集本局「已被占用」的聲音模型 id：
    //  - charMappings：手動綁定/標過模型的角色 → 這些音不讓隨機 NPC 共用
    //  - _npcSessionCache：本局其他 NPC 已抽到的音 → 避免兩個 NPC 撞同一個、同時同音
    _collectUsedModelIds(exceptChar) {
        const used = new Set();
        // 🔑 A 方案：避撞只看「當前卡在場角色」，不把全宇宙綁定都算進來（換卡舊綁定回歸抽池、不累積）。
        //   在場名冊＝VN_Core 記憶體（[Avatar]聲線表 charVoices + 頭像表 avatars + 當前說話者）∪ 本局NPC ∪ 本卡鎖。
        const roster = new Set();
        try {
            const VN = (window.parent || window).VN_Core;
            if (VN) {
                Object.keys(VN.charVoices || {}).forEach(n => roster.add(n));
                Object.keys(VN.avatars || {}).forEach(n => roster.add(n));
                if (VN.currentName) roster.add(VN.currentName);
            }
        } catch (e) {}
        const cm = this.config.charMappings || {};
        // 手動綁定：只排除「在場」那幾個（其他卡綁的不占當前卡的池）
        roster.forEach(name => { if (name !== exceptChar && cm[name]) used.add(cm[name]); });
        // 本卡 NPC 鎖
        const locks = this._cardLocks();
        Object.keys(locks).forEach(name => { if (name !== exceptChar && locks[name]) used.add(locks[name]); });
        // 本局已抽到的 NPC
        const cache = this._npcSessionCache || {};
        Object.keys(cache).forEach(name => { if (name !== exceptChar && cache[name]) used.add(cache[name]); });
        return used;
    },
    // 從池子隨機抽一個「沒被占用」的聲音；全被占用時才退回整池（總比沒聲音好）
    _pickAvailable(modelIds, usedIds) {
        if (!modelIds || !modelIds.length) return null;
        const valid = modelIds.filter(id => this.config.models[id]);
        const free  = valid.filter(id => !usedIds || !usedIds.has(id));
        const pool  = free.length ? free : valid;
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    },

    // ── 角色 → 模型解析 ─────────────────────────────────────────────────
    _resolveModel(charName, typeHint) {
        // 0. 別名 → 主名 normalize（不分大小寫；AI 流口水用全名/小名都能對到）
        let lookupName = charName;
        if (charName && !this.config.charMappings[charName] && this.config.charAliases) {
            const lc = String(charName).toLowerCase();
            for (const [main, aliases] of Object.entries(this.config.charAliases)) {
                if (Array.isArray(aliases) && aliases.some(a => String(a).toLowerCase() === lc)) {
                    lookupName = main;
                    break;
                }
            }
        }

        // 1. 直接對應 (最優先：你手動綁死的角色，全域、面板顯示)
        const mid = this.config.charMappings[lookupName];
        if (mid && this.config.models[mid]) {
            return { id: mid, ...this.config.models[mid] };
        }

        // 1.5 本卡 NPC 聲線鎖（立繪 save CV，按角色卡 id；換卡不算）
        const lid = this._cardLocks()[charName] || this._cardLocks()[lookupName];
        if (lid && this.config.models[lid]) {
            return { id: lid, ...this.config.models[lid] };
        }

        // 2. 檢查記憶體：這個 NPC 剛剛是不是已經抽過聲音了？
        if (this._npcSessionCache[charName]) {
            const cachedId = this._npcSessionCache[charName];
            if (this.config.models[cachedId]) {
                return { id: cachedId, ...this.config.models[cachedId] };
            }
        }

        // 收集已被占用的聲音（綁定角色 + 本局其他 NPC），隨機分配時避開 → 標過模型的角色那份音不給 NPC 共用
        const _usedIds = this._collectUsedModelIds(charName);

        // 3. 🎭 優先匹配：如果有明確的 Type 標籤，去對應的池子抽卡！
        if (typeHint) {
            const lowerType = typeHint.toLowerCase();
            for (const cat of this.config.npcCategories) {
                // 🌟 核心修正：將 ID、名稱與 Tags 一起視為感知範圍
                const matchers = [cat.id, cat.name, ...(cat.tags || [])].filter(Boolean);
                const hit = matchers.some(m => {
                    const lm = String(m).toLowerCase();
                    return lowerType.includes(lm) || lm.includes(lowerType);
                });

                if (hit && cat.modelIds && cat.modelIds.length) {
                    const rid = this._pickAvailable(cat.modelIds, _usedIds);
                    if (rid && this.config.models[rid]) {
                        this._npcSessionCache[charName] = rid; 
                        return { id: rid, ...this.config.models[rid] };
                    }
                }
            }
        }

        // 4. NPC 模糊匹配 (這局第一次開口，開始抽卡)
        const lower = charName.toLowerCase();
        for (const cat of this.config.npcCategories) {
            // 🌟 核心修正：同理，讓主幹（ID/Name）與枝葉（Tags）一起參與模糊匹配
            const matchers = [cat.id, cat.name, ...(cat.tags || [])].filter(Boolean);
            const hit = matchers.some(m => {
                const lm = String(m).toLowerCase();
                return lower.includes(lm) || lm.includes(lower);
            });

            if (hit && cat.modelIds && cat.modelIds.length) {
                // 隨機抽一個聲音
                const rid = cat.modelIds[Math.floor(Math.random() * cat.modelIds.length)];
                if (this.config.models[rid]) {
                    // 鎖定這個聲音！記在腦子裡，下次同一個名字直接用它
                    this._npcSessionCache[charName] = rid; 
                    return { id: rid, ...this.config.models[rid] };
                }
            }
        }
        return null;
    },

    // ── 模型切換（直連 GPT-SoVITS API）──────────────────────────────────
    async _ensureModel(model) {
        if (!model.gptPath && !model.sovitsPath) return; 
        const base = this.config.serverUrl;
        if (this._loadedGpt !== model.gptPath && model.gptPath) {
            await fetch(`${base}/set_gpt_weights?weights_path=${encodeURIComponent(model.gptPath)}`);
            this._loadedGpt = model.gptPath;
        }
        if (this._loadedSovits !== model.sovitsPath && model.sovitsPath) {
            await fetch(`${base}/set_sovits_weights?weights_path=${encodeURIComponent(model.sovitsPath)}`);
            this._loadedSovits = model.sovitsPath;
        }
    },

    // ── 建立 TTS 請求 URL ────────────────────────────────────────────────
    _buildUrl(model, text, emotion, streaming) {
        const useOgg = streaming && this._canStreamOgg();

        let rAudio = model.refAudioPath || '';
        let rText  = model.refText || '';
        let rLang  = model.refLang || 'zh';

        if (emotion && emotion !== 'default' && model.emotions && model.emotions[emotion]) {
            const emData = model.emotions[emotion];
            if (emData.refAudioPath) {
                rAudio = emData.refAudioPath;
                rText  = emData.refText || '';
                rLang  = emData.refLang || 'zh';
            }
        }

        const p = new URLSearchParams({
            text,
            text_lang:      this.config.textLang,
            ref_audio_path: rAudio,
            prompt_text:    rText,
            prompt_lang:    rLang,
            media_type:     useOgg ? 'ogg' : 'wav',
            streaming_mode: streaming ? 'true' : 'false',
            parallel_infer: 'false',
            split_bucket:   'true',
            
            top_k:          String(this.config.topK ?? 15),
            top_p:          String(this.config.topP ?? 1),
            temperature:    String(this.config.temperature ?? 1),
            speed:          String(this.config.speed ?? 1),
            sample_steps:   String(this.config.sampleSteps ?? 32),
            text_split_method: 'cut5'
        });

        if (streaming)                        p.set('fragment_interval', '0.1');
        if (emotion && emotion !== 'default') p.set('emotion', emotion);
        
        return `${this.config.serverUrl}/tts?${p}`;
    },

    // ── 停止當前播放 ────────────────────────────────────────────────────
    stop() {
        if (this._currentAudio) {
            this._currentAudio.pause();
            this._currentAudio.src = '';
            this._currentAudio = null;
        }
        if (this._currentMsUrl) {
            URL.revokeObjectURL(this._currentMsUrl);
            this._currentMsUrl = null;
        }
    },

    _playBlobUrl(blobUrl) {
        this.stop();
        const a = new Audio(blobUrl);
        const _g = (window.parent || window).VN_AudioGain;
        if (_g) _g.set(a, this.config.volume); else a.volume = this.config.volume; // iOS 走 GainNode
        a.play().catch(e => console.warn('[VN_TTS] play error', e));
        this._currentAudio = a;
    },

    // ── OGG 串流播放（MediaSource）──────────────────────────────────────
    _playStreamingOgg(url, cacheKey) {
        this.stop();
        const ms    = new MediaSource();
        const msUrl = URL.createObjectURL(ms);
        const audio = new Audio(msUrl);
        this._currentMsUrl = msUrl;
        this._currentAudio = audio;
        const _g = (window.parent || window).VN_AudioGain;
        if (_g) _g.set(audio, this.config.volume); else audio.volume = this.config.volume; // iOS 走 GainNode
        const chunks = [];

        ms.addEventListener('sourceopen', async () => {
            let sb;
            try {
                sb = ms.addSourceBuffer('audio/ogg; codecs=vorbis');
            } catch (e) {
                console.error('[VN_TTS] SourceBuffer 失敗', e);
                this._pending.delete(cacheKey);
                return;
            }
            const _W = (window.parent || window);
            const _tag = '即時語音(串流)/' + String(cacheKey || '').split('\x00')[0];
            if (this._trace()) console.log('[VN_TTS🔬] 現生（快取沒有）→ ' + _tag);
            const _runQ = (_W.AURELIA_GPU_QUEUE && _W.AURELIA_GPU_QUEUE.run)
                ? (fn) => _W.AURELIA_GPU_QUEUE.run(fn, 0, 90000, _tag)   // 即時語音：最高優先（插隊），90 秒逾時防堵隊
                : (fn) => fn();
            try {
                await _runQ(async () => {
                    const _light = _W.AURELIA_GPU_LIGHT;
                    try {
                        _light && _light.voiceStart();
                        const resp = await fetch(url);
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        const reader   = resp.body.getReader();
                        let firstChunk = true;

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) { try { ms.endOfStream(); } catch (e) {} break; }
                            chunks.push(value);
                            if (sb.updating) {
                                await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
                            }
                            try { sb.appendBuffer(value); } catch (e) { break; }
                            if (firstChunk) { firstChunk = false; audio.play().catch(() => {}); }
                        }
                        if (cacheKey && chunks.length) {
                            const blob = new Blob(chunks, { type: 'audio/ogg' });
                            this._cache[cacheKey] = URL.createObjectURL(blob);
                        }
                    } finally {
                        _light && _light.voiceEnd();
                    }
                });
            } catch (e) {
                console.error('[VN_TTS] streaming 錯誤', e);
            } finally {
                this._pending.delete(cacheKey);
            }
        });
    },

    // ── WAV 完整下載後播放（fallback）──────────────────────────────────
    async _playWavFetch(url, cacheKey) {
        const _W = (window.parent || window);
        const _tag = '即時語音(WAV)/' + String(cacheKey || '').split('\x00')[0];
        if (this._trace()) console.log('[VN_TTS🔬] 現生（快取沒有）→ ' + _tag);
        const _runQ = (_W.AURELIA_GPU_QUEUE && _W.AURELIA_GPU_QUEUE.run)
            ? (fn) => _W.AURELIA_GPU_QUEUE.run(fn, 0, 90000, _tag)   // 即時語音：最高優先（插隊），90 秒逾時防堵隊
            : (fn) => fn();
        try {
            await _runQ(async () => {
                const _light = _W.AURELIA_GPU_LIGHT;
                try {
                    _light && _light.voiceStart();
                    const resp    = await fetch(url);
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const blob    = await resp.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    this._cache[cacheKey] = blobUrl;
                    this._playBlobUrl(blobUrl);
                } finally {
                    _light && _light.voiceEnd();
                }
            });
        } catch (e) {
            console.error('[VN_TTS] WAV fetch 錯誤', e);
        } finally {
            this._pending.delete(cacheKey);
        }
    },

    // ── 播放入口 ────────────────────────────────────────────────────────
    async play(charName, rawText, emotion, typeHint) {
        if (!this.config.enabled) return;
        const text = this.cleanText(rawText);
        if (!text) return;

        const model = this._resolveModel(charName, typeHint);
        if (!model) return;

        return this._speakWithModel(model, text, emotion);
    },

    // ── 系統語音解析（[Sys|系統名|訊息]）────────────────────────────────
    // 系統名 → modelId；指定系統找不到時退回預設系統音（systemMappings[''] / ['*']）
    _resolveSystemModel(sysName) {
        const sm = this.config.systemMappings || {};
        let mid = sysName && sm[sysName];
        if (!mid && sysName) {
            const lc = String(sysName).toLowerCase();
            for (const [k, v] of Object.entries(sm)) {
                if (k && String(k).toLowerCase() === lc) { mid = v; break; }
            }
        }
        if (!mid) mid = sm[''] || sm['*'];   // 預設系統音
        if (mid && this.config.models[mid]) return { id: mid, ...this.config.models[mid] };
        return null;
    },

    // ── 系統語音播放入口 ────────────────────────────────────────────────
    async playSystem(sysName, rawText, emotion) {
        if (!this.config.enabled) return;
        const text = this.cleanText(rawText);
        if (!text) return;

        const model = this._resolveSystemModel(sysName);
        if (!model) return;

        return this._speakWithModel(model, text, emotion);
    },

    // ── 旁白語音播放入口 ─────────────────────────────────────────────────
    //   IndexTTS / Kokoro 開了優先（獨立小服務、不碰 SoVITS GPU 佇列）；否則退 SoVITS 旁白音色（指派了才念）
    async playNarration(rawText, emotion) {
        const ic = this.config.narratorIndex || {};
        if (ic.enabled && ic.url) return this._speakIndex(rawText);
        const kc = this.config.narratorKokoro || {};
        if (kc.enabled && kc.url) return this._speakKokoro(rawText);
        const nm = this.config.narratorMinimax || {};
        if (nm.enabled) return this._speakMinimax(rawText);
        if (!this.config.enabled) return;
        const mid = this.config.narratorModel;
        if (!mid || !this.config.models[mid]) return;   // 沒指派旁白音色 → 靜默（不像系統音退預設）
        const text = this.cleanText(rawText);
        if (!text) return;
        return this._speakWithModel({ id: mid, ...this.config.models[mid] }, text, emotion);
    },

    // ── Kokoro 旁白合成（OpenAI 相容 /v1/audio/speech；獨立服務，不進 GPU 佇列）─
    async _speakKokoro(rawText) {
        const kc = this.config.narratorKokoro || {};
        const base = String(kc.url || '').replace(/\/+$/, '');
        if (!base) return;
        const voice = kc.voice || 'zf_xiaoxiao';
        const text = this._cleanForKokoro(rawText);
        if (!text) return;
        const k = this._cacheKey('kokoro:' + voice, text);
        if (this._cache[k])       { this._playBlobUrl(this._cache[k]); return; }
        if (this._pending.has(k)) { this._waitAndPlay(k); return; }
        this._pending.add(k);
        try {
            const resp = await fetch(base + '/v1/audio/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'kokoro', input: text, voice, response_format: 'mp3', speed: kc.speed || 1 })
            });
            if (!resp.ok) { console.warn('[VN_TTS] Kokoro 回應異常', resp.status); return; }
            const blob = await resp.blob();
            const u = URL.createObjectURL(blob);
            this._cache[k] = u;
            this._playBlobUrl(u);
        } catch (e) {
            console.warn('[VN_TTS] Kokoro 旁白失敗（服務沒開？）', e);
        } finally {
            this._pending.delete(k);
        }
    },

    // ── IndexTTS 角色音色 ───────────────────────────────────────────────
    //   模型長相：{ name, engine:'index', url, voice, emotions:{ 情緒key:{emo:'服務端情緒名'} } }
    //   沒有 gptPath/sovitsPath，所以 _ensureModel 會自己跳過換模型那段。

    // 腳本的表情已被 _mapExprToEmotion 轉成 happy/sad/angry/… 或原樣自訂標籤。
    // 音色自己的 emotions 表只是「這個角色有本人錄的情緒音檔」時的對照，
    // 對不上不能就把情緒丟掉：服務端有一張情緒權重表（認得 happy/sad/生氣/Smirk…），
    // 標籤原樣送過去就能套語氣，權重不帶別人的聲音所以不會變聲。
    // （只靠對照表的話，285 個音色裡只有 4 個有表 ⇒ 其餘全部整場沒有語氣。）
    _indexVoice(model, emotion) {
        const base = model.voice || '';
        if (!emotion || emotion === 'default') return base;
        const em = model.emotions || {};
        const hit = em[emotion]
                 || em[String(emotion).toLowerCase()]
                 || em[Object.keys(em).find(k => k.toLowerCase() === String(emotion).toLowerCase()) || ''];
        return `${base}:${(hit && hit.emo) ? hit.emo : emotion}`;
    },

    async _fetchIndexBlob(model, text, emotion) {
        const base = String(model.url || '').replace(/\/+$/, '');
        if (!base) throw new Error('這個音色沒有服務網址');
        // 語氣強度：面板那顆滑桿（音色可個別覆寫）。共用情緒音檔那條服務端還會再壓一次。
        const alpha = (typeof model.emoAlpha === 'number') ? model.emoAlpha
                    : (typeof this.config.indexEmoAlpha === 'number') ? this.config.indexEmoAlpha : 0.5;
        const resp = await fetch(base + '/v1/audio/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'indextts',
                input: text,
                voice: this._indexVoice(model, emotion),
                response_format: 'mp3',
                speed: model.speed || 1,
                emo_alpha: alpha
            })
        });
        if (!resp.ok) throw new Error('服務回應 ' + resp.status);
        return await resp.blob();
    },

    // ── IndexTTS 旁白合成（本機獨立服務、OpenAI 相容；不進 SoVITS GPU 佇列）──
    //   voice 帶冒號就是情緒，例：'丹:Angry'（情緒＝服務端 emotions/ 裡的檔名）
    async _speakIndex(rawText) {
        const ic = this.config.narratorIndex || {};
        const base = String(ic.url || '').replace(/\/+$/, '');
        if (!base) return;
        const voice = ic.voice || '';
        const text = this._cleanForKokoro(rawText);
        if (!text) return;
        const k = this._cacheKey('index:' + voice, text);
        if (this._cache[k])       { this._playBlobUrl(this._cache[k]); return; }
        if (this._pending.has(k)) { this._waitAndPlay(k); return; }
        this._pending.add(k);
        try {
            const resp = await fetch(base + '/v1/audio/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'indextts', input: text, voice, response_format: 'mp3', speed: ic.speed || 1 })
            });
            if (!resp.ok) { console.warn('[VN_TTS] IndexTTS 回應異常', resp.status); return; }
            const blob = await resp.blob();
            const u = URL.createObjectURL(blob);
            this._cache[k] = u;
            this._playBlobUrl(u);
        } catch (e) {
            console.warn('[VN_TTS] IndexTTS 旁白失敗（服務沒開？）', e);
        } finally {
            this._pending.delete(k);
        }
    },

    // ── MiniMax 旁白合成（雲端，走 OS_MINIMAX；不碰本機 GPU）─────────────
    async _speakMinimax(rawText) {
        const nm = this.config.narratorMinimax || {};
        const voice = nm.voice || 'audiobook_female_1';
        const text = this._cleanForKokoro(rawText);   // 保留標點（MiniMax 也靠標點抓語氣）
        if (!text) return;
        const W = (window.parent || window);
        if (!W.OS_MINIMAX?.play) return;
        try { await W.OS_MINIMAX.play(text, voice); } catch (e) { console.warn('[VN_TTS] MiniMax 旁白失敗（沒設 API key？）', e); }
    },

    // ── 共用：拿到模型後的快取/切換/播放流程 ─────────────────────────────
    async _speakWithModel(model, text, emotion) {
        const k = this._cacheKey(model.id, text);
        const _tr = this._trace();
        if (this._cache[k])    { if (_tr) console.log('[VN_TTS🔬] ✅ 快取命中（早鳥有效）[' + model.id + ']「' + String(text).slice(0, 14) + '…」'); this._playBlobUrl(this._cache[k]); return; }
        if (this._pending.has(k)) { if (_tr) console.log('[VN_TTS🔬] ⏳ 這句正在生（預熱還沒生完）→ 等它 [' + model.id + ']「' + String(text).slice(0, 14) + '…」'); this._waitAndPlay(k); return; }
        if (_tr) console.log('[VN_TTS🔬] ❌ 快取沒有，要現生 [' + model.id + ']「' + String(text).slice(0, 14) + '…」');

        this._pending.add(k);

        // IndexTTS 音色：獨立服務、不換模型、不進 SoVITS GPU 佇列
        if (model.engine === 'index') {
            try {
                const blob = await this._fetchIndexBlob(model, text, emotion);
                const u = URL.createObjectURL(blob);
                this._cache[k] = u;
                this._playBlobUrl(u);
            } catch (e) {
                console.warn('[VN_TTS] IndexTTS 合成失敗（服務沒開？）', model.id, e);
            } finally {
                this._pending.delete(k);
            }
            return;
        }

        try {
            const _tSwap = Date.now();
            const _need = (this._loadedGpt !== model.gptPath && !!model.gptPath) || (this._loadedSovits !== model.sovitsPath && !!model.sovitsPath);
            await this._ensureModel(model);
            if (_tr && _need) console.log('[VN_TTS🔬] ⚠️ 播放前換模型（在佇列外執行）→ ' + model.id + '　耗時 ' + ((Date.now() - _tSwap) / 1000).toFixed(1) + 's');
        } catch (e) {
            console.error('[VN_TTS] 模型切換失敗', e);
            this._pending.delete(k);
            return;
        }

        const streaming = this._canStreamOgg();
        const url = this._buildUrl(model, text, emotion, streaming);
        if (streaming) this._playStreamingOgg(url, k);
        else           this._playWavFetch(url, k);
    },

    _waitAndPlay(k) {
        let t = 0;
        const iv = setInterval(() => {
            if (this._cache[k]) { clearInterval(iv); this._playBlobUrl(this._cache[k]); }
            else if (++t > 360)   clearInterval(iv);
        }, 500);
    },

    // ── 預生成佇列（串行，非串流，只建快取）────────────────────────────
    prewarm(lines) {
        if (!this.config.enabled) return;
        for (const { charName, text, emotion, typeHint } of lines) {
            const cleaned = this.cleanText(text);
            if (!cleaned) continue;
            const model = this._resolveModel(charName, typeHint);
            if (!model) continue;
            const k = this._cacheKey(model.id, cleaned);
            if (this._cache[k] || this._pending.has(k)) continue;
            this._pending.add(k);
            this._prewarmQueue.push({ model, text: cleaned, emotion: emotion || '', key: k });
        }
        if (!this._prewarmRunning) this._runPrewarm();
    },

    async _runPrewarm() {
        this._prewarmRunning = true;
        const _tr = this._trace();
        const _t0 = Date.now();
        let _n = 0, _swaps = 0;
        if (_tr) console.log('[VN_TTS🔬] 預熱佇列啟動：待生 ' + this._prewarmQueue.length + ' 條');
        while (this._prewarmQueue.length) {
            const { model, text, emotion, key } = this._prewarmQueue.shift();
            if (this._cache[key]) { this._pending.delete(key); continue; }

            // IndexTTS 音色不佔 SoVITS 的 GPU 佇列，直接生
            if (model.engine === 'index') {
                try {
                    const blob = await this._fetchIndexBlob(model, text, emotion);
                    this._cache[key] = URL.createObjectURL(blob);
                    _n++;
                } catch (e) {
                    console.warn('[VN_TTS] prewarm 失敗（IndexTTS）', key, e);
                } finally {
                    this._pending.delete(key);
                }
                continue;
            }

            const _W = (window.parent || window);
            const _runQ = (_W.AURELIA_GPU_QUEUE && _W.AURELIA_GPU_QUEUE.run)
                ? (fn) => _W.AURELIA_GPU_QUEUE.run(fn, 2, 120000, '預熱語音/' + model.id)   // 預熱語音：最低優先（圖片/即時語音都先走），120 秒逾時防堵隊
                : (fn) => fn();
            const _needSwap = (this._loadedGpt !== model.gptPath && !!model.gptPath) || (this._loadedSovits !== model.sovitsPath && !!model.sovitsPath);
            if (_needSwap) _swaps++;
            const _tItem = Date.now();
            try {
                await _runQ(async () => {
                    const _tSwap = Date.now();
                    await this._ensureModel(model);
                    if (_tr && _needSwap) console.log('[VN_TTS🔬] 　換模型 → ' + model.id + '　耗時 ' + ((Date.now() - _tSwap) / 1000).toFixed(1) + 's');
                    const url  = this._buildUrl(model, text, emotion, false);
                    const resp = await fetch(url);
                    if (!resp.ok) return;
                    const blob = await resp.blob();
                    this._cache[key] = URL.createObjectURL(blob);
                });
                _n++;
                if (_tr) console.log('[VN_TTS🔬] 　預熱好一條 [' + model.id + '] ' + ((Date.now() - _tItem) / 1000).toFixed(1) + 's（含排隊）　「' + String(text).slice(0, 14) + '…」　剩 ' + this._prewarmQueue.length + ' 條');
            } catch (e) {
                console.warn('[VN_TTS] prewarm 失敗', key, e);
            } finally {
                this._pending.delete(key);
            }
        }
        this._prewarmRunning = false;
        if (_tr) console.log('[VN_TTS🔬] 預熱佇列跑完：' + _n + ' 條／總計 ' + ((Date.now() - _t0) / 1000).toFixed(1) + 's／換模型 ' + _swaps + ' 次');
    },

    // ── 清除快取 ─────────────────────────────────────────────────────────
    clearCache(charName, text) {
        const model = this._resolveModel(charName);
        if (!model) return;
        const k = this._cacheKey(model.id, this.cleanText(text));
        if (this._cache[k]) { URL.revokeObjectURL(this._cache[k]); delete this._cache[k]; }
        this._pending.delete(k);
        this._prewarmQueue = this._prewarmQueue.filter(t => t.key !== k);
    },

    clearAll() {
        Object.values(this._cache).forEach(u => URL.revokeObjectURL(u));
        this._cache = {};
        this._pending.clear();
        this._prewarmQueue = [];
        this._npcSessionCache = {}; // 🎭 同時清除 NPC 的聲音綁定記憶
    }
};

window.VN_TTS = VN_TTS;
VN_TTS.init();

})();