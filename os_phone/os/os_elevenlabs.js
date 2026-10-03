// ----------------------------------------------------------------
// [檔案] os_elevenlabs.js
// 路徑：os_phone/os/os_elevenlabs.js
// 職責：ElevenLabs 語音合成（雲端，瀏覽器直連 api.elevenlabs.io；官方 CORS 全開，不需要伺服器）
//   ① speakVoice()：念一句（帶 VN 表情 → 轉成 v3/v4 吃的 [音訊標籤]，放在句首）
//   ② prefetchVoice()／replayVoice()：預取下一句、免費重播上一句（同 OS_MINIMAX 的做法）
//   ③ listVoices()：抓帳號裡的聲音（自己捏的、複製的、收藏的、內建的），存進設定給「角色配音」下拉選單用
// 誰叫它：只有 os_voice_cast.js（角色配音名單）跟設置頁的試聽；角色名 → 聲音的對照不在這裡。
//
// 官方說明（2026-10 查）：
//   POST /v1/text-to-speech/{voice_id}，標頭 xi-api-key，body { text, model_id, voice_settings? }，回 mp3
//   語氣寫在句子裡：[whispers] [laughs] [sighs] [excited] 這種方括號標籤，放在要影響的那段前面；
//   v3／v4 不吃 SSML <break>，停頓靠 … 跟破折號；v4 只用 stability／similarity 兩個聲音設定。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const win = window.parent || window;
    const STORAGE_KEY = 'os_elevenlabs_config';
    const API = 'https://api.elevenlabs.io';

    const DEFAULT_CONFIG = {
        apiKey: '',
        modelId: 'eleven_v4',
        voices: []          // 上次抓到的聲音 [{ id, name, category }]，下拉選單用；不用每次開面板都打 API
    };

    // 能選的模型（設置頁下拉選單也讀這份）
    const MODELS = [
        { id: 'eleven_v4',                name: 'v4（最自然、吃語氣標籤）' },
        { id: 'eleven_v4_turbo',          name: 'v4 Turbo（快、便宜一半）' },
        { id: 'eleven_v3',                name: 'v3' },
        { id: 'eleven_multilingual_v2',   name: 'Multilingual v2（不吃語氣標籤）' },
        { id: 'eleven_flash_v2_5',        name: 'Flash v2.5（最快、不吃語氣標籤）' }
    ];
    const TAG_MODELS = new Set(['eleven_v4', 'eleven_v4_turbo', 'eleven_v3', 'eleven_v3_conversational']);

    // VN 表情 → 句首的語氣標籤。英文表情原樣當標籤（標籤本來就是自由文字），
    // 中文表情查這張表；平常臉不加，免得每句都被要求「演」。
    const NEUTRAL = new Set(['normal', 'neutral', 'default', 'idle', 'none', 'calm', 'stay', 'leave']);
    const ZH_TAG = {
        '哭': 'crying', '哭泣': 'crying', '難過': 'sad', '难过': 'sad', '傷心': 'sad', '伤心': 'sad', '悲傷': 'sad', '悲伤': 'sad',
        '生氣': 'angry', '生气': 'angry', '憤怒': 'angry', '愤怒': 'angry', '怒': 'angry', '不滿': 'annoyed', '不满': 'annoyed',
        '驚訝': 'surprised', '惊讶': 'surprised', '震驚': 'shocked', '震惊': 'shocked',
        '害怕': 'scared', '恐懼': 'scared', '恐惧': 'scared', '緊張': 'nervous', '紧张': 'nervous', '不安': 'nervous',
        '開心': 'happy', '开心': 'happy', '高興': 'happy', '高兴': 'happy', '笑': 'laughing', '大笑': 'laughs harder', '微笑': 'warmly',
        '害羞': 'shy', '溫柔': 'gently', '温柔': 'gently', '嘆氣': 'sighs', '叹气': 'sighs', '低語': 'whispers', '低语': 'whispers', '耳語': 'whispers',
        '嫌棄': 'disgusted', '嫌弃': 'disgusted', '得意': 'smug', '撒嬌': 'playfully', '撒娇': 'playfully', '疲憊': 'tired', '疲惫': 'tired'
    };
    function expressionToTag(expression) {
        const raw = String(expression || '').trim();
        if (!raw) return '';
        if (ZH_TAG[raw]) return ZH_TAG[raw];
        const low = raw.toLowerCase();
        if (NEUTRAL.has(low)) return '';
        if (!/^[a-z][a-z _\-']*$/i.test(raw)) return '';     // 其他語言的表情名不硬塞（標籤可能被念出來）
        return low.replace(/[_\-]+/g, ', ').replace(/\s+/g, ' ').trim();
    }

    // 送出前清文字：動作描述、系統標籤、引號拿掉；標點（含 …）留著，v3/v4 靠它抓停頓
    function cleanText(text) {
        return String(text || '')
            .replace(/\([^)]*\)/g, '')
            .replace(/（[^）]*）/g, '')
            .replace(/【[^】]*】/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\*[^*]*\*/g, '')
            .replace(/「|」/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function hasSpeakable(text) { return /[぀-ヿ一-龥a-zA-Z0-9]/.test(text); }

    // 送去 API 的整句：表情標籤 + 清好的字（模型不吃標籤就不加）
    function buildText(text, options, cfg) {
        const body = cleanText(text);
        if (!body || !hasSpeakable(body)) return '';
        const tag = TAG_MODELS.has(cfg.modelId || DEFAULT_CONFIG.modelId) ? expressionToTag(options && options.expression) : '';
        return tag ? `[${tag}] ${body}` : body;
    }

    async function callTts(fullText, voiceId, cfg) {
        const res = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({ text: fullText, model_id: cfg.modelId || DEFAULT_CONFIG.modelId })
        });
        if (!res.ok) {
            let msg = res.statusText;
            try { const j = await res.json(); msg = (j.detail && (j.detail.message || j.detail.status || JSON.stringify(j.detail))) || msg; } catch (e) {}
            throw new Error(`API ${res.status}: ${msg}`);
        }
        return await res.blob();
    }

    // --- 播放狀態（跟 OS_MINIMAX 同一套：開始要求就算在念，電話靠它等一句念完）---
    let _isPlaying = false;
    let _isIntentionalStop = false;
    let _currentBlobUrl = null;
    let _replayBlob = null;
    let _replayKey = '';
    const _prefetch = new Map();
    const PREFETCH_MAX = 2;

    function audioEl() {
        const doc = win.document;
        let el = doc.getElementById('os-elevenlabs-tts-player');
        if (!el) {
            el = doc.createElement('audio');
            el.id = 'os-elevenlabs-tts-player';
            el.hidden = true;
            doc.body.appendChild(el);
        }
        return el;
    }
    function releaseUrl() { if (_currentBlobUrl) { URL.revokeObjectURL(_currentBlobUrl); _currentBlobUrl = null; } }

    async function playBlob(blob) {
        const url = URL.createObjectURL(blob);
        _currentBlobUrl = url;
        const audio = audioEl();
        const vol = typeof win._vnTtsVolume === 'number' ? win._vnTtsVolume : 0.8;
        if (win.VN_AudioGain) win.VN_AudioGain.set(audio, vol); else audio.volume = vol;   // iOS 走 GainNode
        audio.onended = () => { _isPlaying = false; releaseUrl(); };
        audio.onerror = (e) => {
            if (!_isIntentionalStop) console.error('[OS_ELEVENLABS] 播放錯誤:', e);
            _isPlaying = false; releaseUrl();
        };
        // 等緩衝好再播，第一個字才不會被吃掉；音檔壞掉也要結束，不然「正在念」永遠不會變回來（電話會一直等）
        await new Promise((resolve, reject) => {
            audio.addEventListener('canplay', resolve, { once: true });
            audio.addEventListener('error', () => reject(new Error('音檔讀不了')), { once: true });
            audio.src = url;
            audio.load();
        });
        await audio.play();
    }

    const OS_ELEVENLABS = {
        MODELS,
        expressionToTag,

        getConfig() {
            try { const s = localStorage.getItem(STORAGE_KEY); if (s) return { ...DEFAULT_CONFIG, ...JSON.parse(s) }; } catch (e) {}
            return { ...DEFAULT_CONFIG };
        },
        // 只改給的欄位（上次抓的聲音清單不會被設置頁的保存蓋掉）
        saveConfig(patch) {
            const next = { ...this.getConfig(), ...(patch || {}) };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        },
        hasKey() { return !!this.getConfig().apiKey; },
        isPlaying() { return _isPlaying; },

        stop() {
            if (!_isPlaying) return;
            _isIntentionalStop = true;
            const audio = audioEl();
            audio.pause();
            audio.removeAttribute('src');
            _isPlaying = false;
            releaseUrl();
            setTimeout(() => { _isIntentionalStop = false; }, 100);
        },

        /** 抓帳號裡的聲音，存進設定。回 [{ id, name, category }] */
        async listVoices(apiKey) {
            const key = apiKey || this.getConfig().apiKey;
            if (!key) throw new Error('NO_KEY');
            const out = [];
            let token = '';
            for (let page = 0; page < 10; page++) {
                const q = new URLSearchParams({ page_size: '100', include_total_count: 'false' });
                if (token) q.set('next_page_token', token);
                const res = await fetch(`${API}/v2/voices?${q}`, { headers: { 'xi-api-key': key } });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((data.detail && (data.detail.message || data.detail.status)) || res.statusText);
                (data.voices || []).forEach(v => out.push({ id: v.voice_id, name: v.name || v.voice_id, category: v.category || '', preview: v.preview_url || '' }));
                if (!data.has_more || !data.next_page_token) break;
                token = data.next_page_token;
            }
            this.saveConfig({ voices: out.map(v => ({ id: v.id, name: v.name, category: v.category })) });
            return out;
        },

        /** 只合成不播，回 Blob */
        async synth(text, voiceId, options = {}) {
            const cfg = this.getConfig();
            if (!cfg.apiKey) throw new Error('NO_KEY');
            if (!voiceId) throw new Error('NO_VOICE');
            const full = buildText(text, options, cfg);
            if (!full) throw new Error('NOTHING_TO_SAY');
            return callTts(full, voiceId, cfg);
        },

        /**
         * 念一句。options: { expression }（VN 的表情，會變成句首標籤）
         * 回 true＝開始念了；沒金鑰、沒字可念、API 失敗回 false（不丟例外，劇情照走）
         */
        async speakVoice(voiceId, text, options = {}) {
            this.stop();
            const cfg = this.getConfig();
            if (!cfg.apiKey) { console.warn('[OS_ELEVENLABS] ⚠️ 還沒填金鑰'); return false; }
            if (!voiceId) return false;
            const full = buildText(text, options, cfg);
            if (!full) return false;
            const key = voiceId + '§' + (cfg.modelId || '') + '§' + full;
            _isPlaying = true;
            _isIntentionalStop = false;
            try {
                let blob;
                if (_prefetch.has(key)) {
                    blob = await _prefetch.get(key);
                    _prefetch.delete(key);
                    if (!blob) throw new Error('預取失敗，沒有聲音');
                } else {
                    console.log('[OS_ELEVENLABS] 請求 →', voiceId, full.slice(0, 30));
                    blob = await callTts(full, voiceId, cfg);
                }
                if (!_isPlaying) return false;     // 合成途中被下一句叫停
                _replayBlob = blob; _replayKey = key;
                await playBlob(blob);
                return true;
            } catch (e) {
                console.error('[OS_ELEVENLABS] ❌ 合成失敗:', e.message);
                _isPlaying = false;
                return false;
            }
        },

        /** 背景先合成下一句，播的時候直接拿 */
        prefetchVoice(voiceId, text, options = {}) {
            const cfg = this.getConfig();
            if (!cfg.apiKey || !voiceId) return;
            const full = buildText(text, options, cfg);
            if (!full) return;
            const key = voiceId + '§' + (cfg.modelId || '') + '§' + full;
            if (_prefetch.has(key)) return;
            if (_prefetch.size >= PREFETCH_MAX) _prefetch.delete(_prefetch.keys().next().value);
            _prefetch.set(key, callTts(full, voiceId, cfg).catch(e => { console.warn('[OS_ELEVENLABS] 預取失敗:', e.message); return null; }));
        },

        /** 重播上一句（同一句才算，不打 API） */
        async replayVoice(voiceId, text, options = {}) {
            const cfg = this.getConfig();
            const full = buildText(text, options, cfg);
            if (!full || !_replayBlob || _replayKey !== voiceId + '§' + (cfg.modelId || '') + '§' + full) return false;
            this.stop();
            _isPlaying = true;
            _isIntentionalStop = false;
            try { await playBlob(_replayBlob); return true; }
            catch (e) { console.error('[OS_ELEVENLABS] ❌ 重播失敗:', e.message); _isPlaying = false; return false; }
        }
    };

    win.OS_ELEVENLABS = OS_ELEVENLABS;
    if (win !== window) window.OS_ELEVENLABS = OS_ELEVENLABS;
    console.log('[OS_ELEVENLABS] ✅ ElevenLabs 語音模組就緒');
})();
