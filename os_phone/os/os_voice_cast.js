// ----------------------------------------------------------------
// [檔案] os_voice_cast.js
// 路徑：os_phone/os/os_voice_cast.js
// 職責：角色配音名單＋「輪到誰講話、用哪個聲音」的唯一入口
//
//   輪到某個角色講話 →
//     ① 名單上有他（名字或別名對得上）→ 用他綁的雲端聲音（Minimax／ElevenLabs）
//     ② 名單上沒有 → 「沒在名單的人」設成本機念，就交給本機（VN_TTS：SoVITS／IndexTTS）
//     ③ 都沒有 → 不念
//   總開關關掉＝全部不念。
//
//   以前是「Minimax／本機／全關閉」三選一：選 Minimax 時沒綁的人全啞、選本機時付費聲音用不到，
//   而且每個念台詞的地方都是本機、Minimax 各叫一次，靠兩邊開關互斥才不會疊在一起念。
//   現在念台詞的地方一律叫 speakAs()，本機那條由呼叫方用 local 傳進來（各自的 VN_Core 不一定同一個）。
//
// 存在 localStorage 'os_voice_cast'：
//   { on, others: 'local' | 'none', entries: [{ label, aliases: [], src: 'minimax' | 'elevenlabs', voiceId, voiceName, lang }] }
//   lang：'any'（不限）| 'zh' | 'en' | 'ja' | 'ko'。同一個角色可以有好幾格、各標一種語言（例：中文用 Minimax、英文用 ElevenLabs），
//   念的時候先看這句是什麼語言（detectLang），挑同名＋同語言那格；沒有就挑「不限」那格；再沒有就第一格。
// 兩個舊開關由這裡推出來寫回去，其他還在讀它們的地方（預熱、系統音、旁白、AI 助手房間）不用改：
//   vn_tts_v1.enabled          ＝ on 且 others 是本機
//   os_minimax_config.enabled  ＝ on
//   os_minimax_config.voiceProfiles ＝ 名單裡 Minimax 那幾位（AI 助手房間用 findVoiceId 查）
// ----------------------------------------------------------------
(function () {
    'use strict';

    const win = window.parent || window;
    const KEY = 'os_voice_cast';
    const MM_KEY = 'os_minimax_config';
    const TTS_KEY = 'vn_tts_v1';

    const LANGS = ['any', 'zh', 'en', 'ja', 'ko'];

    // 這句是什麼語言：有假名＝日文、有韓文字＝韓文、有漢字＝中文、只有英文字母＝英文，其他（只有標點數字）＝不判斷
    function detectLang(text) {
        // 括號裡的不算：外語台詞後面會附中文翻譯「Hello (你好)」，算進去就被當成中文、挑錯聲音
        const s = String(text || '').replace(/[（(][^（）()]*[)）]/g, '');
        if (/[\u3040-\u30ff]/.test(s)) return 'ja';
        if (/[\uac00-\ud7af\u1100-\u11ff]/.test(s)) return 'ko';
        if (/[\u3400-\u9fff]/.test(s)) return 'zh';
        if (/[A-Za-z]/.test(s)) return 'en';
        return '';
    }

    function readJson(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
    function norm(s) { return String(s || '').trim().toLowerCase(); }
    function MM() { return win.OS_MINIMAX || window.OS_MINIMAX; }
    function EL() { return win.OS_ELEVENLABS || window.OS_ELEVENLABS; }
    function TTS() { return win.VN_TTS || window.VN_TTS; }

    // 第一次載入：從舊的三選一跟 Minimax 音色檔案搬過來，行為跟以前一模一樣
    //   選 Minimax → 總開關開、沒在名單的人不念；選本機 → 開、本機念；全關閉 → 關
    function migrate() {
        const mm = readJson(MM_KEY);
        const tts = readJson(TTS_KEY);
        const entries = (Array.isArray(mm.voiceProfiles) ? mm.voiceProfiles : [])
            .filter(p => p && p.label && p.id)
            .map(p => ({ label: p.label, aliases: Array.isArray(p.aliases) ? p.aliases.slice() : [], src: 'minimax', voiceId: p.id, voiceName: '', lang: 'any' }));
        return {
            on: !!(mm.enabled || tts.enabled),
            others: tts.enabled ? 'local' : (mm.enabled ? 'none' : 'local'),
            entries
        };
    }

    function cleanEntry(e) {
        return {
            label: String(e.label || '').trim(),
            aliases: (Array.isArray(e.aliases) ? e.aliases : []).map(a => String(a || '').trim()).filter(Boolean),
            src: e.src === 'elevenlabs' ? 'elevenlabs' : 'minimax',
            voiceId: String(e.voiceId || '').trim(),
            voiceName: String(e.voiceName || '').trim(),
            lang: LANGS.indexOf(e.lang) >= 0 ? e.lang : 'any'
        };
    }

    let _last = '';   // 上一句是誰念的：換人念時把上一個停掉（本機只在上一句是本機時才停，免得切掉本機旁白）

    const OS_VOICE_CAST = {
        getRoster() {
            const raw = localStorage.getItem(KEY);
            if (!raw) return migrate();
            try {
                const r = JSON.parse(raw) || {};
                return {
                    on: !!r.on,
                    others: r.others === 'none' ? 'none' : 'local',
                    entries: (Array.isArray(r.entries) ? r.entries : []).map(cleanEntry).filter(e => e.label && e.voiceId)
                };
            } catch (e) { return migrate(); }
        },

        /** 存名單（只改給的欄位）＋把兩個舊開關跟 Minimax 音色檔案推回去 */
        saveRoster(patch) {
            const cur = this.getRoster();
            const next = { ...cur, ...(patch || {}) };
            next.on = !!next.on;
            next.others = next.others === 'none' ? 'none' : 'local';
            next.entries = (next.entries || []).map(cleanEntry).filter(e => e.label && e.voiceId);
            localStorage.setItem(KEY, JSON.stringify(next));
            this._applyFlags(next);
            return next;
        },

        _applyFlags(r) {
            const localOn = !!(r.on && r.others === 'local');
            try {
                const tts = readJson(TTS_KEY);
                tts.enabled = localOn;
                localStorage.setItem(TTS_KEY, JSON.stringify(tts));
            } catch (e) {}
            const T = TTS();
            if (T && T.config) T.config.enabled = localOn;
            try {
                const mm = readJson(MM_KEY);
                mm.enabled = !!r.on;
                mm.voiceProfiles = r.entries.filter(e => e.src === 'minimax').map(e => ({ label: e.label, id: e.voiceId, aliases: e.aliases.slice() }));
                localStorage.setItem(MM_KEY, JSON.stringify(mm));
            } catch (e) {}
        },

        isOn() { return this.getRoster().on; },
        localOn() { const r = this.getRoster(); return r.on && r.others === 'local'; },

        detectLang,

        /**
         * 名單上這個名字（或別名）要用哪一格；沒有回 null。總開關關著也照查（設置頁、AI 助手房間用）。
         * 給了 text 就照這句的語言挑：同語言那格 → 「不限」那格 → 第一格（綁了聲音的人永遠走雲端，不會因為語言對不上就換回本機）
         */
        find(name, roster, text) {
            const n = norm(name);
            if (!n) return null;
            const r = roster || this.getRoster();
            // 同名的幾格算同一個人：別名只寫在其中一格，其他語言那格也認得
            const who = new Set(r.entries.filter(e => norm(e.label) === n || e.aliases.some(a => norm(a) === n)).map(e => norm(e.label)));
            const hits = r.entries.filter(e => who.has(norm(e.label)));
            if (!hits.length) return null;
            const lang = text != null ? detectLang(text) : '';
            return (lang && hits.find(e => e.lang === lang)) || hits.find(e => e.lang === 'any') || hits[0];
        },
        /** 現在真的會用雲端聲音念他嗎（總開關開著＋名單上有）；給 text 就照語言挑那一格 */
        cloudFor(name, text) {
            const r = this.getRoster();
            return r.on ? this.find(name, r, text) : null;
        },
        /** 本機預熱用：名單上的人不用本機先生（反正會走雲端） */
        has(name) { return !!this.cloudFor(name); },

        _stopOthers(kind) {
            try { if (kind !== 'minimax' && MM()) MM().stop(); } catch (e) {}
            try { if (kind !== 'elevenlabs' && EL()) EL().stop(); } catch (e) {}
            try { if (kind !== 'local' && _last === 'local' && TTS() && TTS().stop) TTS().stop(); } catch (e) {}
            _last = kind;
        },

        /**
         * 讓某個角色念一句。
         * @param {string} name    角色名
         * @param {string} text    給雲端念的字（呼叫方已壓到「」內）
         * @param {object} opts    { expression: VN 表情（不含聲線前綴）, local: () => 本機念這句 }
         * @returns {string} 誰在念：'minimax' | 'elevenlabs' | 'sovits' | ''（電話要照這個等它念完）
         */
        speakAs(name, text, opts = {}) {
            const r = this.getRoster();
            if (!r.on) return '';
            const e = this.find(name, r, text);
            if (e) {
                const P = e.src === 'elevenlabs' ? EL() : MM();
                if (!P || !P.speakVoice) return '';
                this._stopOthers(e.src);
                P.speakVoice(e.voiceId, text, { expression: opts.expression || '' });
                return e.src;
            }
            if (r.others === 'local' && typeof opts.local === 'function') {
                this._stopOthers('local');
                try { opts.local(); } catch (err) { console.warn('[OS_VOICE_CAST] 本機念失敗', err); }
                return 'sovits';
            }
            return '';
        },

        /** 下一句先合成（只有名單上的雲端聲音需要） */
        prefetchAs(name, text, opts = {}) {
            const e = this.cloudFor(name, text);
            if (!e) return;
            const P = e.src === 'elevenlabs' ? EL() : MM();
            if (P && P.prefetchVoice) P.prefetchVoice(e.voiceId, text, { expression: opts.expression || '' });
        },

        /** 重播上一句：雲端有快取就免費重播，回 true；不是雲端或沒快取回 false */
        async replayAs(name, text, opts = {}) {
            const e = this.cloudFor(name, text);
            if (!e) return false;
            const P = e.src === 'elevenlabs' ? EL() : MM();
            if (!P || !P.replayVoice) return false;
            this._stopOthers(e.src);
            return !!(await P.replayVoice(e.voiceId, text, { expression: opts.expression || '' }));
        },

        isPlaying() {
            try { if (MM() && MM().isPlaying()) return true; } catch (e) {}
            try { if (EL() && EL().isPlaying()) return true; } catch (e) {}
            return false;
        },
        stopCloud() {
            try { if (MM()) MM().stop(); } catch (e) {}
            try { if (EL()) EL().stop(); } catch (e) {}
        }
    };

    win.OS_VOICE_CAST = OS_VOICE_CAST;
    if (win !== window) window.OS_VOICE_CAST = OS_VOICE_CAST;
    console.log('[OS_VOICE_CAST] ✅ 角色配音名單就緒');
})();
