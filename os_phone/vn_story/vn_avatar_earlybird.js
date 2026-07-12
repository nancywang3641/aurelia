// ============================================================================
// VN_AvatarEarlybird — 早鳥：搶在正文生完之前開生頭像＋預熱語音
// ----------------------------------------------------------------------------
// 原理：頭像描述 [Avatar|名|描述] 位於訊息開頭的 <ChapterCard> 內。
//   • 有開串流 → AI 還在寫後面正文的一兩分鐘裡，ChapterCard 早已完整 →
//     立刻開生（最大提早量，VN 開播時頭像多半已躺在快取）
//   • 沒開串流（朋友忘了勾）→ 退回 MESSAGE_RECEIVED，訊息落地瞬間開生，
//     仍比 VN loadScript（使用者進 VN／自動偵測後）早一拍，零設定零感知
//
// 去重三層：本模組單輪 once 鎖 → VN_Core._avatarInflight → IDB avatar_cache。
// 生成本體走 VN_Core.earlybirdFromText（與 loadScript 預熱共用同一條管線與快取）。
//
// 🎙 語音便車（2026-07-13）：正文是流式輸出、[Char|] 台詞一行行落地 →
//   輪詢時把「已完整落地」的台詞逐批餵 VN_TTS.prewarm（GPU 佇列優先序 2，
//   搶不了圖片的位、只吃空檔；生圖走雲端時=白撿整段撰寫窗口）。
//   去重靠 VN_TTS 既有 (model,text) 快取鍵——loadScript 後的 _prewarmSoVITS
//   全量掃描會自動跳過已排/已生的句子，照舊保留當補漏。
//   關閉：localStorage vn_voice_earlybird = '0'。
// ============================================================================
(function (win) {
    'use strict';

    let _doneThisGen = false;   // 一輪生成只觸發一次（拿到完整 ChapterCard 就鎖）
    let _pollTimer = null;      // 生成期間輪詢聊天文本（TauriTavern 不發串流事件也抓得到）
    let _voiceSeen = new Set(); // 🎙 本輪已排隊的台詞行（GENERATION_STARTED 清空）

    function _scan(text) {
        if (_doneThisGen || !text) return;
        // 等 ChapterCard 完整閉合再掃，避免吃到沒寫完的半行
        if (text.indexOf('</ChapterCard>') === -1) return;
        const VN = win.VN_Core;
        if (!VN || typeof VN.earlybirdFromText !== 'function') return;
        _doneThisGen = true;
        VN.earlybirdFromText(text);
    }

    // ── 🎙 語音早鳥：掃流式正文裡「已完整落地」的 [Char|名|表情|台詞] → VN_TTS.prewarm ──
    //   解析邏輯照抄 vn_core._prewarmSoVITS（同一套 _extractTextAndSFX/_cleanTextForSoVITS
    //   → 快取 key 對齊，之後全量預熱自動去重）。final=false 時最後一行永遠不碰（可能只寫到一半）。
    function _voiceScan(text, final) {
        try {
            if (!text) return;
            if (localStorage.getItem('vn_voice_earlybird') === '0') return;
            const VN = win.VN_Core;
            const TTS = (win.parent || win).VN_TTS;
            if (!VN || !TTS || !TTS.config || !TTS.config.enabled || typeof TTS.prewarm !== 'function') return;
            // 鐵律：先剝 <thinking>（CoT 自檢會提到 tag 字樣），再從 <content> 開始抓（同 loadScript）
            const noCot = String(text).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
            const ci = noCot.indexOf('<content>');
            if (ci === -1) return;   // 還在思考期，正文沒開始
            const body = noCot.slice(ci + 9);
            // 聲線：持久化（老角色）+ 本則 ChapterCard 的 [Avatar|名|聲線|外觀]（新角色，比台詞先出現）
            const voices = Object.assign({}, (VN._loadCharVoices ? VN._loadCharVoices() : {}), VN.charVoices || {});
            const regAv = /^\s*\[Avatar\|([^|\]\n]+)\|([^\]\n]+)\]\s*$/gmi;
            let m;
            while ((m = regAv.exec(body)) !== null) {
                const rest = m[2].split('|').map(s => s.trim());
                if (rest.length >= 2 && rest[0]) voices[m[1].trim()] = rest[0];
            }
            const lines = body.split('\n');
            if (!final) lines.pop();   // 串流途中：尾行可能是半句 → 留給下一輪／落地掃兜底
            const batch = [];
            for (const raw of lines) {
                const line = raw.trim();
                if (!line.startsWith('[Char|') || !line.endsWith(']') || _voiceSeen.has(line)) continue;
                _voiceSeen.add(line);
                const parts = line.slice(6, -1).split('|');
                const charName = parts[0];
                const ex = VN._extractTextAndSFX(parts.slice(2));
                const t = VN._cleanTextForSoVITS(ex.text);
                let rawExp = parts[1] || '', typeHint = '';
                if (rawExp.includes('_')) {
                    const p = rawExp.split('_');
                    typeHint = p[0].trim();
                    rawExp = p.slice(1).join('_').trim();
                }
                if (!typeHint) typeHint = voices[charName] || '';
                if (!t || (TTS._resolveModel && !TTS._resolveModel(charName, typeHint))) continue;
                batch.push({ charName, text: t, emotion: VN._mapExprToEmotion ? VN._mapExprToEmotion(rawExp) : '', typeHint });
            }
            if (batch.length) {
                TTS.prewarm(batch);
                console.log('[VN_AvatarEarlybird] 🎙 語音便車：' + batch.length + ' 條台詞排入預熱佇列');
            }
        } catch (e) {}
    }

    function _stopPoll() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

    // 來源①：資料模型（串流時酒館「應該」把半成品逐步寫進 chat 末條）
    function _readModelText() {
        try {
            const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
            if (!ctx || !ctx.chat || !ctx.chat.length) return '';
            const m = ctx.chat[ctx.chat.length - 1];
            if (!m || m.is_user) return '';
            return m.mes || m.message || '';
        } catch (e) { return ''; }
    }
    // 來源②：DOM（某些平台串流途中只畫進畫面、還沒寫進資料模型）
    function _readDomText() {
        try {
            const doc = (win && win.document) ? win.document : document;
            const mesList = doc.querySelectorAll('#chat .mes');
            if (!mesList || !mesList.length) return '';
            const last = mesList[mesList.length - 1];
            if (!last || last.getAttribute('is_user') === 'true') return '';
            const t = last.querySelector('.mes_text');
            return (t && (t.textContent || t.innerText)) || '';
        } catch (e) { return ''; }
    }
    // 取半成品：資料模型優先，空了退 DOM（平台無關、不靠事件）
    function _readStreamingText() {
        return _readModelText() || _readDomText();
    }

    function _startPoll() {
        _stopPoll();
        const t0 = Date.now();
        _pollTimer = setInterval(function () {
            // 🎙 頭像掃完（_doneThisGen）不再停輪詢：語音便車要一路跟著正文長大，直到 GENERATION_ENDED
            if ((Date.now() - t0) > 300000) { _stopPoll(); return; }
            const t = _readStreamingText();
            if (!t) return;
            if (!_doneThisGen) _scan(t);
            _voiceScan(t, false);
        }, 1500);
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        const ev = win.tavern_events;

        // 每輪生成開始：解鎖（含 swipe / 重生）＋ 開始輪詢半成品文本
        if (ev.GENERATION_STARTED) win.eventOn(ev.GENERATION_STARTED, function (type, opts, dryRun) {
            if (dryRun) return;   // 🚫 dryRun 試算空跑 → 別啟動早鳥生圖(免空跑燒 GPU/API)
            if (win.__AURELIA_SUMMARIZING) return;   // 🚫 大總結的 generateRaw 也發此事件 → 別啟動頭像早鳥生圖
            _doneThisGen = false;
            _voiceSeen.clear();   // 🎙 新一輪（含 swipe/重生）→ 台詞去重集歸零
            _startPoll();
        });
        if (ev.GENERATION_ENDED) win.eventOn(ev.GENERATION_ENDED, function () { _stopPoll(); });

        // 串流事件路（有發就更即時；TauriTavern 沒發也無所謂，輪詢頂著）
        if (ev.STREAM_TOKEN_RECEIVED) win.eventOn(ev.STREAM_TOKEN_RECEIVED, function (text) {
            try {
                if (typeof text === 'string') { _scan(text); _voiceScan(text, false); }
            } catch (e) {}
        });

        // 保險路：訊息落地立刻掃，不必等 VN 載入（語音做最終掃描：補尾行＋沒開串流的整篇）
        if (ev.MESSAGE_RECEIVED) win.eventOn(ev.MESSAGE_RECEIVED, async function (messageId) {
            try {
                _stopPoll();
                if (win.__AURELIA_SUMMARIZING) return;   // 🚫 大總結期間別掃生頭像/語音
                const msgs = await win.TavernHelper?.getChatMessages?.(messageId);
                const m = msgs && msgs[0];
                if (!m || m.is_user) return;
                const t = m.message || m.mes || '';
                if (!t) return;
                _voiceScan(t, true);
                if (!_doneThisGen) _scan(t);
            } catch (e) {}
        });

        console.log('[VN_AvatarEarlybird] ✅ 早鳥已掛載（頭像＋語音便車；輪詢＋串流事件＋訊息完成三保險）');
    }
    init();

    win.VN_AvatarEarlybird = { scan: _scan, voiceScan: _voiceScan };
})(window);
