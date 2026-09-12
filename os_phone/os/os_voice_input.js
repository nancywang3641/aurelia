// ----------------------------------------------------------------
// [手機] os_voice_input.js — 麥克風錄音 → 轉成字
// 職責：錄一段話、交給選定的「轉字方式」、回傳文字＋情緒＋聲音事件。不畫任何畫面，誰要用誰接。
//   ① 錄音走 MediaRecorder，錄完回原始音檔 blob（之後要做「泡泡裡是真的聲音」就存它）。
//   ② 轉字方式是一張表 ENGINES，跟圖片設置的來源一樣可以換；每一種只要實作 transcribe(blob)。
//      現在只有 sensevoice：SenseVoice 模型放進網頁裡跑（sherpa-onnx 的 WebAssembly 版），聲音不離開裝置。
//   ③ sensevoice 第一次要下載約 250MB（引擎 12MB＋模型 239MB），存進瀏覽器的 Cache Storage，之後不再下載。
//      下載與推論都在 Worker 裡，不卡畫面。模型是簡體輸出，Worker 裡用 opencc-js 轉台灣繁體。
//   ④ 引擎檔鎖在 HuggingFace 的固定 commit：官方網頁版把模型打包在 .data 裡，我們把那段打包載入剝掉，
//      自己把 SenseVoice 模型寫進它的虛擬檔案系統。換 commit 前要重新確認剝除的標記還在。
// 入口：window.OS_VOICE_INPUT
//   isSupported() / getConfig() / setConfig({engine})
//   start() → stop() 回 { blob, mime, durationSec }；cancel()
//   prepare(onProgress) 先把目前的轉字方式準備好（sensevoice＝下載＋載入模型）
//   transcribe(blob, { onProgress, autoPrepare }) 回 { text, lang, emotion, emotionLabel, event, eventLabel, durationSec, engine }
//   isReady() / unload()（放掉記憶體）/ clearCache()（刪掉下載的模型）
// ----------------------------------------------------------------
(function () {
    const win = window.parent || window;
    if (win.OS_VOICE_INPUT) return;

    const CFG_KEY = 'os_voice_input_config';
    const DEFAULTS = { engine: 'sensevoice', language: '' };

    function getConfig() {
        try { return Object.assign({}, DEFAULTS, JSON.parse(win.localStorage.getItem(CFG_KEY) || '{}')); }
        catch (e) { return Object.assign({}, DEFAULTS); }
    }
    function setConfig(patch) {
        const prev = getConfig();
        const next = Object.assign({}, prev, patch || {});
        try { win.localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch (e) { console.warn('[VoiceInput] 設定存不進去', e); }
        if (next.language !== prev.language && next.engine === prev.engine) {
            const e = ENGINES[next.engine];
            if (e && e.setLanguage) e.setLanguage(next.language).catch((err) => console.warn('[VoiceInput] 換語言失敗', err));
        }
        return next;
    }

    // SenseVoice 回來的標籤長這樣：<|HAPPY|>、<|Laughter|>
    const EMOTION_LABEL = { HAPPY: '開心', SAD: '難過', ANGRY: '生氣', FEARFUL: '害怕', DISGUSTED: '嫌棄', SURPRISED: '驚訝', NEUTRAL: '', EMO_UNKNOWN: '' };
    const EVENT_LABEL = { Speech: '', BGM: '背景音樂', Applause: '掌聲', Laughter: '笑聲', Cry: '哭聲', Sneeze: '打噴嚏', Breath: '呼吸聲', Cough: '咳嗽' };
    const bareTag = (s) => String(s || '').replace(/<\||\|>/g, '').trim();

    // ── 錄音 ─────────────────────────────────────────
    let _rec = null;

    function isSupported() {
        const md = win.navigator && win.navigator.mediaDevices;
        return !!(md && md.getUserMedia && win.MediaRecorder && win.WebAssembly && win.Worker);
    }

    function _pickMime() {
        const MR = win.MediaRecorder;
        const list = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
        for (const m of list) { try { if (MR.isTypeSupported && MR.isTypeSupported(m)) return m; } catch (e) {} }
        return '';
    }

    function _release(r) {
        try { r.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    }

    async function start() {
        if (_rec) throw new Error('已經在錄了');
        if (!isSupported()) throw new Error('這個瀏覽器不能錄音');
        const stream = await win.navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const mime = _pickMime();
        const mr = new win.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks = [];
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mr.start();
        _rec = { stream, mr, chunks, t0: Date.now(), mime: mr.mimeType || mime };
    }

    function stop() {
        return new Promise((resolve, reject) => {
            const r = _rec;
            if (!r) { reject(new Error('沒有在錄音')); return; }
            _rec = null;
            r.mr.onstop = () => {
                _release(r);
                const blob = new win.Blob(r.chunks, { type: r.mime || 'audio/webm' });
                resolve({ blob, mime: blob.type, durationSec: (Date.now() - r.t0) / 1000 });
            };
            r.mr.onerror = (e) => { _release(r); reject((e && e.error) || new Error('錄音失敗')); };
            try { r.mr.stop(); } catch (e) { _release(r); reject(e); }
        });
    }

    function cancel() {
        const r = _rec;
        _rec = null;
        if (!r) return;
        try { r.mr.onstop = null; r.mr.stop(); } catch (e) {}
        _release(r);
    }

    // 任何瀏覽器錄得出來的格式都解成單聲道 PCM；取樣率照原樣交出去，引擎自己會轉成 16k
    async function _decodeToMono(blob) {
        const buf = await blob.arrayBuffer();
        const OAC = win.OfflineAudioContext || win.webkitOfflineAudioContext;
        if (!OAC) throw new Error('這個瀏覽器解不開音檔');
        const ctx = new OAC(1, 1, 44100);
        const ab = await new Promise((resolve, reject) => {
            const p = ctx.decodeAudioData(buf, resolve, reject);
            if (p && p.then) p.then(resolve, reject);
        });
        const n = ab.length;
        const ch = ab.numberOfChannels;
        let samples;
        if (ch === 1) {
            samples = new Float32Array(ab.getChannelData(0));
        } else {
            samples = new Float32Array(n);
            for (let c = 0; c < ch; c++) {
                const d = ab.getChannelData(c);
                for (let i = 0; i < n; i++) samples[i] += d[i] / ch;
            }
        }
        return { samples, sampleRate: ab.sampleRate, durationSec: ab.duration };
    }

    // ── SenseVoice（網頁裡跑）────────────────────────────
    const SV = {
        ENGINE_BASE: 'https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-zipformer-ctc/resolve/9d5fc71d88ab1222ed1af2274fb194592af48455/',
        // 🚨 用 2024-07-17 這包（FunAudioLLM 原版 SenseVoice）。同作者 2025-09-09 那包是粵語微調版，國語會被聽成粵語、吃掉字
        MODEL_BASE: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/',
        OPENCC: 'https://cdn.jsdelivr.net/npm/opencc-js@1.4.2/dist/umd/cn2t.js',
        CACHE: 'aurelia-voice-input-v2',
        // 各檔大小：伺服器沒給長度時拿來算總進度
        SIZES: { main: 95308, asr: 47391, wasm: 11722172, tokens: 315894, model: 239233841 },
    };

    // 這個函式整支被轉成字串丟進 Worker，裡面不能引用外面的任何變數
    function _svWorkerMain() {
        let recognizer = null;
        let toTw = null;
        let cfg = null;

        const post = (m) => self.postMessage(m);

        // language：'' 自動判斷；'zh' 國語、'yue' 粵語、'en'、'ja'、'ko'
        function recognizerConfig(language) {
            return {
                featConfig: { sampleRate: 16000, featureDim: 80 },
                modelConfig: {
                    senseVoice: { model: './sense-voice.onnx', language: language || '', useInverseTextNormalization: 1 },
                    tokens: './tokens.txt',
                    numThreads: 1,
                    provider: 'cpu',
                    debug: 0,
                },
            };
        }

        async function openCache() {
            try { return self.caches ? await caches.open(cfg.CACHE) : null; } catch (e) { return null; }
        }

        // 有快取直接拿；沒有就邊下載邊存進快取（串流寫入，不在記憶體裡多留一份）
        async function getFile(key, url, asText) {
            const cache = await openCache();
            const expect = cfg.SIZES[key] || 0;
            if (cache) {
                const hit = await cache.match(url);
                if (hit) {
                    post({ type: 'progress', key, loaded: expect, total: expect, cached: true });
                    return asText ? hit.text() : hit.arrayBuffer();
                }
            }
            const res = await fetch(url);
            if (!res.ok) throw new Error('下載失敗（' + key + '，HTTP ' + res.status + '）');
            const total = Number(res.headers.get('content-length')) || expect;
            let loaded = 0;
            let last = 0;
            const counter = new TransformStream({
                transform(chunk, ctrl) {
                    loaded += chunk.byteLength;
                    const now = Date.now();
                    if (now - last > 250) { last = now; post({ type: 'progress', key, loaded, total }); }
                    ctrl.enqueue(chunk);
                },
            });
            const counted = new Response(res.body.pipeThrough(counter), { headers: { 'content-type': res.headers.get('content-type') || '' } });
            if (cache) {
                try {
                    await cache.put(url, counted);
                    post({ type: 'progress', key, loaded: total, total });
                    const back = await cache.match(url);
                    if (back) return asText ? back.text() : back.arrayBuffer();
                } catch (e) {
                    post({ type: 'warn', msg: '存不進快取，這次直接用：' + (e && e.message) });
                    const again = await fetch(url);
                    return asText ? again.text() : again.arrayBuffer();
                }
            }
            const out = asText ? await counted.text() : await counted.arrayBuffer();
            post({ type: 'progress', key, loaded: total, total });
            return out;
        }

        function runScript(src) {
            const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
            try { importScripts(url); } finally { URL.revokeObjectURL(url); }
        }

        async function init(c) {
            cfg = c;
            const [mainSrc, asrSrc, wasm] = await Promise.all([
                getFile('main', cfg.ENGINE_BASE + 'sherpa-onnx-wasm-main-vad-asr.js', true),
                getFile('asr', cfg.ENGINE_BASE + 'sherpa-onnx-asr.js', true),
                getFile('wasm', cfg.ENGINE_BASE + 'sherpa-onnx-wasm-main-vad-asr.wasm', false),
            ]);

            // 官方版會去抓一包 360MB 的 .data（裡面是別的模型），剝掉那段，模型我們自己放
            const a = mainSrc.indexOf('(function(){if(Module["ENVIRONMENT_IS_PTHREAD"]');
            const b0 = a >= 0 ? mainSrc.indexOf('"remote_package_size"', a) : -1;
            const b = b0 >= 0 ? mainSrc.indexOf('})();', b0) : -1;
            if (a < 0 || b < 0) throw new Error('語音引擎的檔案格式變了，載不起來');
            const engineSrc = mainSrc.slice(0, a) + mainSrc.slice(b + 5);

            await new Promise((resolve, reject) => {
                self.Module = {
                    wasmBinary: wasm,
                    locateFile: (p) => p,
                    print: () => {},
                    printErr: (t) => { if (/error/i.test(String(t))) post({ type: 'warn', msg: String(t) }); },
                    onRuntimeInitialized: resolve,
                    onAbort: (why) => reject(new Error('語音引擎啟動失敗：' + why)),
                };
                runScript(engineSrc);
            });
            runScript(asrSrc + '\n;self.__SOX_OfflineRecognizer = OfflineRecognizer;');

            const tokens = await getFile('tokens', cfg.MODEL_BASE + 'tokens.txt', false);
            const model = await getFile('model', cfg.MODEL_BASE + 'model.int8.onnx', false);
            post({ type: 'stage', stage: 'loading' });

            const M = self.Module;
            M.FS_createDataFile('/', 'tokens.txt', new Uint8Array(tokens), true, false, true);
            M.FS_createDataFile('/', 'sense-voice.onnx', new Uint8Array(model), true, false, true);
            recognizer = new self.__SOX_OfflineRecognizer(recognizerConfig(cfg.language), M);
            // 模型已經讀進引擎了，檔案系統那份放掉
            try { M.FS_unlink('/sense-voice.onnx'); } catch (e) {}
            if (!recognizer.handle) throw new Error('聽寫模型載入失敗');

            try {
                importScripts(cfg.OPENCC);
                toTw = self.OpenCC.Converter({ from: 'cn', to: 'twp' });
            } catch (e) {
                post({ type: 'warn', msg: '簡轉繁載不到，這次先給簡體：' + (e && e.message) });
            }
        }

        function transcribe(samples, sampleRate) {
            const stream = recognizer.createStream();
            try {
                stream.acceptWaveform(sampleRate, samples);
                recognizer.decode(stream);
                const r = recognizer.getResult(stream) || {};
                const raw = String(r.text || '').trim();
                return { text: toTw ? toTw(raw) : raw, rawText: raw, lang: r.lang || '', emotion: r.emotion || '', event: r.event || '' };
            } finally {
                stream.free();
            }
        }

        self.onmessage = async (ev) => {
            const { id, cmd } = ev.data || {};
            try {
                if (cmd === 'init') { await init(ev.data.cfg); post({ type: 'done', id }); }
                else if (cmd === 'transcribe') {
                    if (!recognizer) throw new Error('聽寫模型還沒載入');
                    post({ type: 'done', id, result: transcribe(ev.data.samples, ev.data.sampleRate) });
                }
            } catch (e) {
                post({ type: 'fail', id, error: String((e && e.message) || e) });
            }
        };
    }

    const sensevoice = {
        id: 'sensevoice',
        label: '在手機裡轉（SenseVoice）',
        downloadMB: 250,
        _worker: null,
        _ready: false,
        _preparing: null,
        _seq: 0,
        _pending: {},
        _progress: null,

        _spawn() {
            const src = '(' + _svWorkerMain.toString() + ')();';
            const url = win.URL.createObjectURL(new win.Blob([src], { type: 'text/javascript' }));
            const w = new win.Worker(url);
            win.URL.revokeObjectURL(url);
            const loaded = {};
            w.onmessage = (ev) => {
                const m = ev.data || {};
                if (m.type === 'progress') {
                    loaded[m.key] = m.loaded;
                    const total = Object.values(SV.SIZES).reduce((s, v) => s + v, 0);
                    const got = Object.keys(SV.SIZES).reduce((s, k) => s + Math.min(loaded[k] || 0, SV.SIZES[k]), 0);
                    if (this._progress) this._progress({ stage: 'download', percent: Math.round((got / total) * 100), file: m.key, cached: !!m.cached });
                } else if (m.type === 'stage') {
                    if (this._progress) this._progress({ stage: m.stage, percent: 100 });
                } else if (m.type === 'warn') {
                    console.warn('[VoiceInput]', m.msg);
                } else if (m.type === 'done' || m.type === 'fail') {
                    const p = this._pending[m.id];
                    if (!p) return;
                    delete this._pending[m.id];
                    if (m.type === 'done') p.resolve(m.result); else p.reject(new Error(m.error));
                }
            };
            w.onerror = (e) => {
                const msg = (e && e.message) || '語音引擎當掉了';
                Object.values(this._pending).forEach((p) => p.reject(new Error(msg)));
                this._pending = {};
                this.unload();
            };
            return w;
        },

        _call(msg, transfer) {
            const id = ++this._seq;
            return new Promise((resolve, reject) => {
                this._pending[id] = { resolve, reject };
                this._worker.postMessage(Object.assign({ id }, msg), transfer || []);
            });
        },

        isReady() { return this._ready; },

        // 這版引擎沒有「載好後改設定」，換語言＝放掉，下次用到時從快取重載（約一兩秒）
        setLanguage() {
            this.unload();
            return Promise.resolve();
        },

        prepare(onProgress) {
            if (this._ready) return Promise.resolve();
            if (onProgress) this._progress = onProgress;
            if (this._preparing) return this._preparing;
            this._worker = this._spawn();
            this._preparing = this._call({ cmd: 'init', cfg: Object.assign({}, SV, { language: getConfig().language }) })
                .then(() => { this._ready = true; })
                .catch((e) => { this.unload(); throw e; })
                .finally(() => { this._preparing = null; this._progress = null; });
            return this._preparing;
        },

        async transcribe(blob) {
            const pcm = await _decodeToMono(blob);
            const r = await this._call({ cmd: 'transcribe', samples: pcm.samples, sampleRate: pcm.sampleRate }, [pcm.samples.buffer]);
            r.durationSec = pcm.durationSec;
            return r;
        },

        unload() {
            if (this._worker) { try { this._worker.terminate(); } catch (e) {} }
            this._worker = null;
            this._ready = false;
        },

        async clearCache() {
            this.unload();
            if (win.caches) await win.caches.delete(SV.CACHE);
        },
    };

    const ENGINES = { sensevoice };

    function _engine() {
        const e = ENGINES[getConfig().engine];
        if (!e) throw new Error('沒有這種轉字方式：' + getConfig().engine);
        return e;
    }

    async function transcribe(blob, opts) {
        const o = opts || {};
        const e = _engine();
        if (!e.isReady()) {
            if (!o.autoPrepare) {
                const err = new Error('轉字方式還沒準備好');
                err.code = 'NOT_READY';
                throw err;
            }
            await e.prepare(o.onProgress);
        }
        const r = await e.transcribe(blob);
        const emo = bareTag(r.emotion);
        const evt = bareTag(r.event);
        return {
            text: r.text || '',
            lang: bareTag(r.lang),
            emotion: emo,
            emotionLabel: EMOTION_LABEL[emo] || '',
            event: evt,
            eventLabel: EVENT_LABEL[evt] || '',
            durationSec: r.durationSec || 0,
            engine: e.id,
        };
    }

    win.OS_VOICE_INPUT = {
        ENGINES,
        isSupported,
        getConfig,
        setConfig,
        start,
        stop,
        cancel,
        isRecording: () => !!_rec,
        prepare: (onProgress) => _engine().prepare(onProgress),
        isReady: () => _engine().isReady(),
        transcribe,
        unload: () => _engine().unload(),
        clearCache: () => (_engine().clearCache ? _engine().clearCache() : Promise.resolve()),
    };
})();
