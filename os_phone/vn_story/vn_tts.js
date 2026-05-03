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

        // NPC 分類: [{ id, name, tags:[], modelIds:[] }]
        npcCategories: []
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
                if (!this.config.npcCategories)  this.config.npcCategories = [];
            }
        } catch (e) {}
        console.log('[VN_TTS] 初始化, 啟用:', this.config.enabled);
    },

    save() {
        localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
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

    _cacheKey(modelId, text) { return `${modelId}\x00${text}`; },


    // ── 角色 → 模型解析 ─────────────────────────────────────────────────
    _resolveModel(charName, typeHint) {
        // 1. 直接對應 (最優先：你手動綁死的角色)
        const mid = this.config.charMappings[charName];
        if (mid && this.config.models[mid]) {
            return { id: mid, ...this.config.models[mid] };
        }

        // 2. 檢查記憶體：這個 NPC 剛剛是不是已經抽過聲音了？
        if (this._npcSessionCache[charName]) {
            const cachedId = this._npcSessionCache[charName];
            if (this.config.models[cachedId]) {
                return { id: cachedId, ...this.config.models[cachedId] };
            }
        }

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
                    const rid = cat.modelIds[Math.floor(Math.random() * cat.modelIds.length)];
                    if (this.config.models[rid]) {
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
        a.volume = this.config.volume;
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
        audio.volume = this.config.volume;
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
            try {
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
            } catch (e) {
                console.error('[VN_TTS] streaming 錯誤', e);
            } finally {
                this._pending.delete(cacheKey);
            }
        });
    },

    // ── WAV 完整下載後播放（fallback）──────────────────────────────────
    async _playWavFetch(url, cacheKey) {
        try {
            const resp    = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob    = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            this._cache[cacheKey] = blobUrl;
            this._playBlobUrl(blobUrl);
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

        const k = this._cacheKey(model.id, text);
        if (this._cache[k])    { this._playBlobUrl(this._cache[k]); return; }
        if (this._pending.has(k)) { this._waitAndPlay(k); return; }

        this._pending.add(k);
        try {
            await this._ensureModel(model);
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
        while (this._prewarmQueue.length) {
            const { model, text, emotion, key } = this._prewarmQueue.shift();
            if (this._cache[key]) { this._pending.delete(key); continue; }
            try {
                await this._ensureModel(model);
                const url  = this._buildUrl(model, text, emotion, false);
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const blob = await resp.blob();
                this._cache[key] = URL.createObjectURL(blob);
            } catch (e) {
                console.warn('[VN_TTS] prewarm 失敗', key, e);
            } finally {
                this._pending.delete(key);
            }
        }
        this._prewarmRunning = false;
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