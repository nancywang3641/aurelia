// ============================================================================
// VN_AvatarEarlybird — 頭像早鳥：搶在正文生完之前開生頭像
// ----------------------------------------------------------------------------
// 原理：頭像描述 [Avatar|名|描述] 位於訊息開頭的 <ChapterCard> 內。
//   • 有開串流 → AI 還在寫後面正文的一兩分鐘裡，ChapterCard 早已完整 →
//     立刻開生（最大提早量，VN 開播時頭像多半已躺在快取）
//   • 沒開串流（朋友忘了勾）→ 退回 MESSAGE_RECEIVED，訊息落地瞬間開生，
//     仍比 VN loadScript（使用者進 VN／自動偵測後）早一拍，零設定零感知
//
// 去重三層：本模組單輪 once 鎖 → VN_Core._avatarInflight → IDB avatar_cache。
// 生成本體走 VN_Core.earlybirdFromText（與 loadScript 預熱共用同一條管線與快取）。
// ============================================================================
(function (win) {
    'use strict';

    let _doneThisGen = false;   // 一輪生成只觸發一次（拿到完整 ChapterCard 就鎖）
    let _pollTimer = null;      // 生成期間輪詢聊天文本（TauriTavern 不發串流事件也抓得到）

    function _scan(text) {
        if (_doneThisGen || !text) return;
        // 等 ChapterCard 完整閉合再掃，避免吃到沒寫完的半行
        if (text.indexOf('</ChapterCard>') === -1) return;
        const VN = win.VN_Core;
        if (!VN || typeof VN.earlybirdFromText !== 'function') return;
        _doneThisGen = true;
        VN.earlybirdFromText(text);
    }

    function _stopPoll() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

    // 串流時酒館會把半成品持續寫進 chat 末條 → 直接讀它，平台無關、不靠事件
    function _readStreamingText() {
        try {
            const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
            if (!ctx || !ctx.chat || !ctx.chat.length) return '';
            const m = ctx.chat[ctx.chat.length - 1];
            if (!m || m.is_user) return '';
            return m.mes || m.message || '';
        } catch (e) { return ''; }
    }

    function _startPoll() {
        _stopPoll();
        const t0 = Date.now();
        _pollTimer = setInterval(function () {
            if (_doneThisGen || (Date.now() - t0) > 300000) { _stopPoll(); return; }
            const t = _readStreamingText();
            if (t) _scan(t);
            if (_doneThisGen) _stopPoll();
        }, 1500);
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        const ev = win.tavern_events;

        // 每輪生成開始：解鎖（含 swipe / 重生）＋ 開始輪詢半成品文本
        if (ev.GENERATION_STARTED) win.eventOn(ev.GENERATION_STARTED, function () {
            if (win.__AURELIA_SUMMARIZING) return;   // 🚫 大總結的 generateRaw 也發此事件 → 別啟動頭像早鳥生圖
            _doneThisGen = false;
            _startPoll();
        });
        if (ev.GENERATION_ENDED) win.eventOn(ev.GENERATION_ENDED, function () { _stopPoll(); });

        // 串流事件路（有發就更即時；TauriTavern 沒發也無所謂，輪詢頂著）
        if (ev.STREAM_TOKEN_RECEIVED) win.eventOn(ev.STREAM_TOKEN_RECEIVED, function (text) {
            try { if (typeof text === 'string') _scan(text); } catch (e) {}
        });

        // 保險路：訊息落地立刻掃，不必等 VN 載入
        if (ev.MESSAGE_RECEIVED) win.eventOn(ev.MESSAGE_RECEIVED, async function (messageId) {
            try {
                _stopPoll();
                if (win.__AURELIA_SUMMARIZING) return;   // 🚫 大總結期間別掃生頭像
                if (_doneThisGen) return;
                const msgs = await win.TavernHelper?.getChatMessages?.(messageId);
                const m = msgs && msgs[0];
                if (!m || m.is_user) return;
                const t = m.message || m.mes || '';
                if (t) _scan(t);
            } catch (e) {}
        });

        console.log('[VN_AvatarEarlybird] ✅ 頭像早鳥已掛載（輪詢＋串流事件＋訊息完成三保險）');
    }
    init();

    win.VN_AvatarEarlybird = { scan: _scan };
})(window);
