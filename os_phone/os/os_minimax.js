// ----------------------------------------------------------------
// [檔案] os_minimax.js (V1.4)
// 路徑：os_phone/os/os_minimax.js
// 職責：Minimax TTS 語音合成模組（獨立）
// 更新 V1.3：
//   ① cleanTextForTts 只清標籤，保留中文標點（讓 API 有語調依據）
//   ② 預設模型改為 speech-02-turbo（表現力明顯優於 speech-01）
//   ③ 新增 EXPRESSION_EMOTION_MAP：VN Expression → Minimax emotion 自動映射
//   ④ play() 支援 options.emotion，傳入 voice_setting.emotion
//   ⑤ playForChar() 接收 expression 參數，自動轉 emotion 後播放
// 跨面板通用：VN 面板、wx 面板皆可直接呼叫
// ----------------------------------------------------------------
(function() {
    'use strict';
    console.log('[PhoneOS] 載入 Minimax TTS 模組 (V1.3)...');

    const win = window.parent || window;
    const STORAGE_KEY = 'os_minimax_config';

    // 預設配置
    // ② 預設模型改為 speech-02-turbo
    const DEFAULT_CONFIG = {
        enabled: false,
        groupId: '',
        apiKey: '',
        provider: 'cn',
        speechModel: 'speech-02-turbo',
        defaultSpeed: 1.0,
        defaultLanguageBoost: '',
        voiceProfiles: []
    };

    // ③ Expression → Minimax emotion 全局對照表（大小寫不敏感比對）
    // 涵蓋常見 VN 表情命名慣例（英文/中文/縮寫）
    // Minimax t2a_v2 有效 emotion 值（僅此 5 個，happy/neutral 已移除）：
    // sad | angry | fearful | disgusted | surprised
    // 找不到對應 → 不傳 emotion，讓音色自然語調發揮
    const EXPRESSION_EMOTION_MAP = {
        // Sad 系
        'sad':      'sad',   'cry':      'sad',   'sob':     'sad',
        'weep':     'sad',   'crying':   'sad',   'depressed':'sad',
        'grief':    'sad',   'gloomy':   'sad',   'hurt':    'sad',
        '悲伤':     'sad',   '哭':       'sad',   '難過':    'sad',
        '伤心':     'sad',   '悲':       'sad',

        // Angry 系
        'angry':    'angry', 'mad':      'angry', 'rage':    'angry',
        'annoyed':  'angry', 'furious':  'angry', 'irritated':'angry',
        'tsun':     'angry', 'sulk':     'angry',
        '愤怒':     'angry', '生气':     'angry', '怒':      'angry',
        '不满':     'angry', '憤怒':     'angry',

        // Surprised 系
        'surprised':'surprised', 'shock':    'surprised', 'shocked':  'surprised',
        'amazed':   'surprised', 'startled': 'surprised', 'astonished':'surprised',
        '惊讶':     'surprised', '惊喜':     'surprised', '驚':       'surprised',
        '震惊':     'surprised',

        // Fearful 系
        'fearful':  'fearful', 'fear':     'fearful', 'scared':   'fearful',
        'nervous':  'fearful', 'anxious':  'fearful', 'timid':    'fearful',
        'worried':  'fearful', 'panic':    'fearful',
        '恐惧':     'fearful', '害怕':     'fearful', '緊張':     'fearful',
        '不安':     'fearful',

        // Disgusted 系
        'disgusted':'disgusted', 'disgust':  'disgusted', 'dislike':  'disgusted',
        '厌恶':     'disgusted', '嫌弃':     'disgusted',
    };

    // --- 內部狀態 ---
    let _isPlaying = false;
    let _isIntentionalStop = false;
    let _currentBlobUrl = null;

    // --- 重播快取（Blob 物件，不受 revokeObjectURL 影響，供免費重播使用）---
    let _replayBlob = null;
    let _replayBlobKey = '';

    // --- 預取快取（key = voiceId§cleanedText，value = Promise<Blob|null>）---
    const _prefetchCache = new Map();
    const PREFETCH_MAX = 2;  // 最多快取幾句

    // 抽離 API 呼叫，供 play() 與 prefetch 共用；回傳 Blob（不是 URL）
    async function _callTtsApi(textForTts, voiceId, options, cfg) {
        const baseUrl = cfg.provider === 'io'
            ? 'https://api.minimax.io'
            : 'https://api.minimaxi.com';
        const requestUrl = `${baseUrl}/v1/t2a_v2?GroupId=${cfg.groupId}`;
        const voiceSetting = { voice_id: voiceId, speed: options.speed ?? cfg.defaultSpeed ?? 1.0 };
        if (options.emotion) voiceSetting.emotion = options.emotion;
        const requestBody = { model: cfg.speechModel || 'speech-02-turbo', text: textForTts, voice_setting: voiceSetting };
        const lb = options.language_boost ?? cfg.defaultLanguageBoost;
        if (lb) requestBody.language_boost = lb;

        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const result = await response.json();
        if (!response.ok || (result.base_resp && result.base_resp.status_code !== 0)) {
            throw new Error(`API ${result.base_resp?.status_code || response.status}: ${result.base_resp?.status_msg || response.statusText}`);
        }
        if (!result.data?.audio) throw new Error('回應無音頻數據');
        const blob = hexToBlob(result.data.audio);
        if (!blob) throw new Error('Hex 轉換失敗');
        return blob;  // 回傳 Blob，由呼叫方決定何時建 URL
    }

    // --- 工具：取得或建立 <audio> 元素 ---
    function getAudioEl() {
        const doc = win.document;
        let el = doc.getElementById('os-minimax-tts-player');
        if (!el) {
            el = doc.createElement('audio');
            el.id = 'os-minimax-tts-player';
            el.style.display = 'none';
            doc.body.appendChild(el);
        }
        return el;
    }

    // --- 工具：Hex 字符串 → Blob ---
    function hexToBlob(hex) {
        if (!hex) return null;
        const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
        if (cleanHex.length % 2 !== 0) {
            console.error('[OS_MINIMAX] Hex 長度為奇數，解碼失敗');
            return null;
        }
        const buffer = new Uint8Array(cleanHex.length / 2);
        for (let i = 0; i < cleanHex.length; i += 2) {
            buffer[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
        }
        return new Blob([buffer], { type: 'audio/mpeg' });
    }

    // --- 工具：Hex 字符串 → Blob URL（舊接口保留）---
    function hexToBlobUrl(hex) {
        const b = hexToBlob(hex);
        return b ? URL.createObjectURL(b) : null;
    }

    // 支援語氣詞的模型白名單（僅 speech-2.8-hd / speech-2.8-turbo）
    const VOCAL_SUPPORT_MODELS = new Set(['speech-2.8-hd', 'speech-2.8-turbo']);

    // 語氣詞對照表：中文（簡/繁）→ Minimax API 英文標籤
    const VOCAL_ZH_TO_EN = {
        // 簡體
        '笑声':   'laughs',       '轻笑':   'chuckle',    '咳嗽':   'coughs',
        '清嗓子': 'clear-throat', '呻吟':   'groans',     '正常换气':'breath',
        '喘气':   'pant',         '吸气':   'inhale',     '呼气':   'exhale',
        '倒吸气': 'gasps',        '吸鼻子': 'sniffs',     '叹气':   'sighs',
        '哼':     'snorts',       '咂嘴':   'lip-smacking','哼唱':  'humming',
        '嘶嘶声': 'hisses',       '呃':     'emm',        '喷嚏':   'sneezes',
        '口哨':   'whistles',
        // 繁體
        '笑聲':   'laughs',       '輕笑':   'chuckle',    '正常換氣':'breath',
        '喘氣':   'pant',         '吸氣':   'inhale',     '呼氣':   'exhale',
        '倒吸氣': 'gasps',        '吸鼻子': 'sniffs',     '嘆氣':   'sighs',
        '咂嘴':   'lip-smacking', '哼唱':   'humming',    '嘶嘶聲': 'hisses',
        '噴嚏':   'sneezes',
    };
    // 英文語氣詞白名單（直接透傳，不清除）
    const VOCAL_EN_SET = new Set([
        'laughs','chuckle','coughs','clear-throat','groans','breath',
        'pant','inhale','exhale','gasps','sniffs','sighs','snorts',
        'lip-smacking','humming','hisses','emm','sneezes','whistles',
    ]);

    // 檢查是否有實質可念內容（至少有一個中文字、英文字母或數字）
    function _hasSpeakable(text) {
        return /[\u4e00-\u9fa5a-zA-Z0-9]/.test(text);
    }

    // ① 清洗 TTS 文字：移除 VN 標籤和動作括號，保留中文標點
    // supportsVocal=true 時：將中文語氣詞轉為英文標籤（僅限 speech-2.8-hd/turbo）
    // supportsVocal=false 時：所有括號內容一律清除
    function cleanTextForTts(text, supportsVocal = false) {
        return (text || '')
            .replace(/\(([^)]*)\)/g, (m, inner) => {
                if (!supportsVocal) return '';
                const key = inner.trim();
                if (VOCAL_EN_SET.has(key)) return ` (${key}) `;    // 已是英文，透傳
                const en = VOCAL_ZH_TO_EN[key];
                if (en) return ` (${en}) `;                          // 中文轉英文
                return '';                                            // 其他清除
            })
            .replace(/（[^）]*）/g, '')          // 移除 （中文括號內容）
            .replace(/【[^】]*】/g, '')          // 移除 【系統標籤】
            .replace(/\[[^\]]*\]/g, '')          // 移除 [VN標籤]
            .replace(/\*[^*]*\*/g, '')           // 移除 *動作描述*
            .replace(/「|」/g, '')               // 移除引號（保留內容）
            .replace(/\s+/g, ' ')               // 多餘空白合併
            .trim();
    }

    // --- 主要接口 ---
    const OS_MINIMAX = {

        /** 讀取設定 */
        getConfig() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try { return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }; } catch(e) {}
            }
            return { ...DEFAULT_CONFIG };
        },

        /** 儲存設定 */
        saveConfig(data) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_CONFIG, ...data }));
        },

        /** 是否正在播放 */
        isPlaying() { return _isPlaying; },

        /**
         * ③ 將 VN Expression 名稱轉換為 Minimax emotion 值
         * 先查全局對照表，找不到回傳 null（API 不傳 emotion = 預設 neutral）
         */
        expressionToEmotion(expression) {
            if (!expression) return null;
            const key = expression.trim().toLowerCase();
            return EXPRESSION_EMOTION_MAP[key] || null;
        },

        /**
         * 依角色名查找音色ID（匹配 label 或任一 alias，大小寫不敏感）
         */
        findVoiceId(charName) {
            if (!charName) return null;
            const cfg = this.getConfig();
            const name = charName.trim().toLowerCase();
            for (const p of (cfg.voiceProfiles || [])) {
                if (!p.id) continue;
                if ((p.label || '').trim().toLowerCase() === name) return p.id;
                if (Array.isArray(p.aliases)) {
                    for (const alias of p.aliases) {
                        if ((alias || '').trim().toLowerCase() === name) return p.id;
                    }
                }
            }
            return null;
        },

        /** 停止當前播放 */
        stop() {
            if (!_isPlaying) return;
            _isIntentionalStop = true;
            const audio = getAudioEl();
            audio.pause();
            audio.src = '';
            _isPlaying = false;
            if (_currentBlobUrl) { URL.revokeObjectURL(_currentBlobUrl); _currentBlobUrl = null; }
            setTimeout(() => { _isIntentionalStop = false; }, 100);
        },

        /**
         * 合成並播放語音
         * @param {string} text
         * @param {string} voiceId
         * @param {object} options - { speed, language_boost, emotion }
         *   emotion: 'happy'|'sad'|'angry'|'fearful'|'disgusted'|'surprised'|'neutral'
         *            不傳則 API 自行判斷（通常 neutral）
         */
        async play(text, voiceId, options = {}) {
            this.stop();
            await new Promise(r => setTimeout(r, 50));

            const cfg = this.getConfig();
            if (!cfg.groupId || !cfg.apiKey) {
                console.warn('[OS_MINIMAX] ⚠️ 尚未設置 Group ID 或 API Key');
                return false;
            }
            if (!voiceId) {
                console.warn('[OS_MINIMAX] ⚠️ 未提供 voiceId');
                return false;
            }

            const supportsVocal = VOCAL_SUPPORT_MODELS.has(cfg.speechModel || '');
            const textForTts = cleanTextForTts(text, supportsVocal);
            if (!textForTts || !_hasSpeakable(textForTts)) return false; // 純標點/省略號跳過

            const cacheKey = voiceId + '§' + textForTts;
            _isPlaying = true;
            _isIntentionalStop = false;

            try {
                let blob;
                if (_prefetchCache.has(cacheKey)) {
                    // 🎯 命中預取快取，直接取用
                    console.log('[OS_MINIMAX] 🎯 預取命中 →', voiceId, textForTts.slice(0, 20));
                    blob = await _prefetchCache.get(cacheKey);
                    _prefetchCache.delete(cacheKey);
                    if (!blob) throw new Error('預取失敗，無音頻');
                } else {
                    // 即時呼叫 API
                    console.log('[OS_MINIMAX] 請求 TTS →', voiceId,
                        options.emotion ? `[${options.emotion}]` : '[no emotion]',
                        textForTts.slice(0, 20));
                    blob = await _callTtsApi(textForTts, voiceId, options, cfg);
                }

                // 存入重播快取（Blob 物件不受 revokeObjectURL 影響）
                _replayBlob = blob;
                _replayBlobKey = cacheKey;

                const blobUrl = URL.createObjectURL(blob);
                _currentBlobUrl = blobUrl;
                const audio = getAudioEl();
                audio.volume = typeof win._vnTtsVolume === 'number' ? win._vnTtsVolume : 0.8;
                audio.onended = () => {
                    _isPlaying = false;
                    if (_currentBlobUrl) { URL.revokeObjectURL(_currentBlobUrl); _currentBlobUrl = null; }
                };
                audio.onerror = (e) => {
                    if (!_isIntentionalStop) console.error('[OS_MINIMAX] 播放錯誤:', e);
                    _isPlaying = false;
                    if (_currentBlobUrl) { URL.revokeObjectURL(_currentBlobUrl); _currentBlobUrl = null; }
                };
                // 等音訊緩衝就緒再播，避免第一個字被吃掉
                await new Promise(resolve => {
                    audio.addEventListener('canplay', resolve, { once: true });
                    audio.src = blobUrl;
                    audio.load();
                });
                await audio.play();
                console.log('[OS_MINIMAX] ✅ 播放中 →', voiceId, options.emotion || '');
                return true;

            } catch (error) {
                console.error('[OS_MINIMAX] ❌ TTS 失敗:', error.message);
                _isPlaying = false;
                return false;
            }
        },

        /**
         * 預取下一句 TTS（背景靜默呼叫，不播放）
         * 供 vn_core 在當前句顯示後立刻呼叫
         */
        prefetchForChar(charName, text, options = {}) {
            const cfg = this.getConfig();
            if (!cfg.enabled || !cfg.groupId || !cfg.apiKey) return;

            // NSFW 過濾
            const SKIP_EXPRESSIONS = ['sex', 'nsfw', 'r18', 'erotic', 'lewd'];
            if (SKIP_EXPRESSIONS.some(k => (options.expression || '').toLowerCase().includes(k))) return;

            const voiceId = this.findVoiceId(charName);
            if (!voiceId) return;

            // expression → emotion
            const pfOptions = { ...options };
            if (options.expression && !options.emotion) {
                const mapped = this.expressionToEmotion(options.expression);
                if (mapped) pfOptions.emotion = mapped;
            }

            const supportsVocal = VOCAL_SUPPORT_MODELS.has(cfg.speechModel || '');
            const textForTts = cleanTextForTts(text, supportsVocal);
            if (!textForTts || !_hasSpeakable(textForTts)) return; // 純標點/省略號跳過

            const cacheKey = voiceId + '§' + textForTts;
            if (_prefetchCache.has(cacheKey)) return; // 已在預取

            // 快取超量時驅逐最舊的，並釋放 blob URL
            if (_prefetchCache.size >= PREFETCH_MAX) {
                const [oldKey, oldPromise] = _prefetchCache.entries().next().value;
                _prefetchCache.delete(oldKey);
                oldPromise.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
            }

            console.log('[OS_MINIMAX] 🔮 預取 →', charName, textForTts.slice(0, 20));
            _prefetchCache.set(cacheKey,
                _callTtsApi(textForTts, voiceId, pfOptions, cfg).catch(e => {
                    console.warn('[OS_MINIMAX] 預取失敗:', e.message);
                    return null;
                })
            );
        },

        /**
         * ⑤ 依角色名查音色 + 自動將 expression 轉換為 emotion 後播放
         * 供 VN / wx 面板呼叫
         * @param {string} charName  - 角色名（自動匹配別名）
         * @param {string} text      - 對白文字
         * @param {object} options   - { expression, speed, language_boost }
         *   expression: VN 的 p[1]，例如 'Happy'、'Angry_Cry'
         *               自動對應 EXPRESSION_EMOTION_MAP，找不到則不傳 emotion
         */
        async playForChar(charName, text, options = {}) {
            const cfg = this.getConfig();
            if (!cfg.enabled) return false;

            // 🔇 過濾含 Sex/NSFW 標記的表情，靜音跳過
            const SKIP_EXPRESSIONS = ['sex', 'nsfw', 'r18', 'erotic', 'lewd'];
            const exprLower = (options.expression || '').toLowerCase();
            if (SKIP_EXPRESSIONS.some(k => exprLower.includes(k))) {
                console.log(`[OS_MINIMAX] 🔇 跳過（含 ${options.expression} 標記）`);
                return false;
            }

            const voiceId = this.findVoiceId(charName);
            if (!voiceId) return false;

            // expression → emotion 自動轉換
            if (options.expression && !options.emotion) {
                const mapped = this.expressionToEmotion(options.expression);
                if (mapped) options.emotion = mapped;
                // 找不到對標情緒 → 不傳 emotion，讓 Minimax 用音色預設語調
            }

            return this.play(text, voiceId, options);
        },

        /**
         * 重播最近一句 TTS（從記憶體 Blob 快取，不呼叫 API）
         * 命中 → 播放並回傳 true；未命中 → 回傳 false（呼叫方應 fallback 到 playForChar）
         */
        async replayLast(charName, text, options = {}) {
            const cfg = this.getConfig();
            if (!cfg.enabled || !cfg.groupId || !cfg.apiKey) return false;
            const voiceId = this.findVoiceId(charName);
            if (!voiceId) return false;
            const supportsVocal = VOCAL_SUPPORT_MODELS.has(cfg.speechModel || '');
            const textForTts = cleanTextForTts(text, supportsVocal);
            if (!textForTts || !_hasSpeakable(textForTts)) return false;

            const cacheKey = voiceId + '§' + textForTts;
            if (_replayBlobKey !== cacheKey || !_replayBlob) return false;  // 快取不命中

            // 快取命中：從 Blob 建新 URL，不打 API
            this.stop();
            await new Promise(r => setTimeout(r, 50));
            _isPlaying = true;
            _isIntentionalStop = false;
            try {
                const blobUrl = URL.createObjectURL(_replayBlob);
                _currentBlobUrl = blobUrl;
                const audio = getAudioEl();
                audio.volume = typeof win._vnTtsVolume === 'number' ? win._vnTtsVolume : 0.8;
                audio.onended = () => {
                    _isPlaying = false;
                    if (_currentBlobUrl) { URL.revokeObjectURL(_currentBlobUrl); _currentBlobUrl = null; }
                };
                audio.onerror = (e) => {
                    if (!_isIntentionalStop) console.error('[OS_MINIMAX] 重播錯誤:', e);
                    _isPlaying = false;
                    if (_currentBlobUrl) { URL.revokeObjectURL(_currentBlobUrl); _currentBlobUrl = null; }
                };
                await new Promise(resolve => {
                    audio.addEventListener('canplay', resolve, { once: true });
                    audio.src = blobUrl;
                    audio.load();
                });
                await audio.play();
                console.log('[OS_MINIMAX] ♻️ 重播快取 →', charName);
                return true;
            } catch(error) {
                console.error('[OS_MINIMAX] ❌ 重播失敗:', error.message);
                _isPlaying = false;
                return false;
            }
        }
    };

    win.OS_MINIMAX = OS_MINIMAX;
    console.log('[OS_MINIMAX] ✅ Minimax TTS 模組就緒 (V1.4)');
})();
