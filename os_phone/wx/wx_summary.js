// ----------------------------------------------------------------
// [檔案] wx_summary.js (V1)
// 路徑：os_phone/wx/wx_summary.js
// 職責：聊天室自己的長期記憶。把一個聊天室裡「早前的訊息」壓成一段摘要，
//       送給模型時只帶「摘要 ＋ 最近 N 則原文」，不再整串歷史全帶。
//
// 為什麼要有這支：
//   buildContext 以前是 apiChat.messages.forEach(...)——**一則都沒切**。私聊聊久了
//   整串幾百則全進 prompt：又貴又慢，而且重要的事被埋在一堆寒暄裡。
//   （可調的那個「每群聊消息數」是**關聯群聊**的上限，跟私聊自己的歷史無關。）
//
// 🚨 為什麼不用「索引指標」切歷史：
//   微信的訊息物件**沒有穩定 id**（只有 type/isMe/content/raw/sender…）。若用
//   「已摘要到第 N 則」當指標去跳過開頭，使用者從中間刪掉幾則之後指標就歪了，
//   會把**還沒摘要過的**訊息一起跳掉——那是靜默失憶，最難查。
//   所以這裡分成兩件事：
//     · 注入時：永遠只取 messages.slice(-keep)，不看指標 → 刪訊息也不可能漏。
//     · 生成時：才用 coveredCount 決定「這次要把哪一段折進摘要」，而且發現
//       總數比上次少（＝有刪過）就整份重建，寧可多花一次也不留錯的帳。
//
// 存哪：就存在 api_chat 那筆記錄裡（apiChat.wxSummary），不另開資料庫。
//   saveApiChat(id, d) 的 d 就是整包記錄，加欄位**不用升 OS_DB 版本**（避開升版 deadlock），
//   而且一室一份天然分艙、刪聊天室摘要跟著消失、備份也已經涵蓋 api_chats。
//
// 誰來觸發：大總結存檔完會順便跑一次（os_story_tools 的 _doSave，fire-and-forget）；
//   聊天設定頁「早前記錄」也能手動整理。
// 用哪顆模型：副模型（chatSecondary）。跟地圖番外記事重壓縮同款——工具型短輸出。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WX] 載入聊天室記憶模塊 (wx_summary V1)...');
    const win = window.parent || window;

    const KEEP_KEY = 'wx_sum_keep_recent';   // 全域預設：注入時保留最近幾則原文
    const MIN_KEY  = 'wx_sum_min_fold';      // 至少累積這麼多沒整理過的才值得跑一次
    const ON_KEY   = 'wx_sum_enabled';       // '0' = 關掉整個功能

    const DEF_KEEP = 40;
    const DEF_MIN  = 20;
    const KEEP_MIN = 5;      // 保留再少也要有這麼多，否則模型接不上話
    const KEEP_MAX = 500;
    const FEED_MAX_CHARS = 12000;   // 單次餵給副模型的上限；超過就只折最舊的那一段，下次再折

    function _int(v, d) { const n = parseInt(v); return (isNaN(n) || n < 0) ? d : n; }
    function _clampKeep(n) { return Math.max(KEEP_MIN, Math.min(KEEP_MAX, n)); }

    function isEnabled() { try { return localStorage.getItem(ON_KEY) !== '0'; } catch (e) { return true; } }

    // 每室可以自己覆寫「保留最近幾條」；沒設就吃全域預設
    function keepOf(apiChat) {
        const per = apiChat && apiChat.summaryKeepRecent;
        if (per != null && per !== '') return _clampKeep(_int(per, DEF_KEEP));
        let g = DEF_KEEP;
        try { g = _int(localStorage.getItem(KEEP_KEY), DEF_KEEP); } catch (e) {}
        return _clampKeep(g);
    }
    function minFold() {
        let m = DEF_MIN;
        try { m = _int(localStorage.getItem(MIN_KEY), DEF_MIN); } catch (e) {}
        return Math.max(1, m);
    }

    function _msgs(apiChat) {
        return (apiChat && Array.isArray(apiChat.messages)) ? apiChat.messages : [];
    }

    // 現在這個聊天室該怎麼折。純計算，不碰 DB、不打 API —— 可以單獨拿去測。
    function plan(apiChat) {
        const msgs = _msgs(apiChat);
        const total = msgs.length;
        const keep = keepOf(apiChat);
        const s = (apiChat && apiChat.wxSummary) ? apiChat.wxSummary : null;

        // 有刪過訊息（總數比上次整理當下還少）→ 舊的 coveredCount 已經不可信，整份重建
        const rebuild = !!(s && s.totalAtSummary != null && total < s.totalAtSummary);
        let covered = (s && !rebuild) ? _int(s.coveredCount, 0) : 0;
        if (covered > total) covered = 0;          // 保險：怎麼樣都不准指到界外

        const foldTo = Math.max(0, total - keep);  // 折到這一則為止，後面留原文
        const pending = Math.max(0, foldTo - covered);
        return {
            total: total, keep: keep, covered: covered, foldTo: foldTo,
            pending: pending, rebuild: rebuild,
            can: isEnabled() && pending >= minFold()
        };
    }

    // 注入時要帶的那段原文。**永遠只看最後 keep 則**，不理 coveredCount。
    function recentWindow(apiChat) {
        const msgs = _msgs(apiChat);
        const keep = keepOf(apiChat);
        return (msgs.length > keep) ? msgs.slice(-keep) : msgs;
    }

    // 有摘要就回一段 system 文字，沒有就回 null
    function injectionText(apiChat) {
        if (!isEnabled()) return null;
        const s = (apiChat && apiChat.wxSummary) ? apiChat.wxSummary : null;
        const t = s && s.text ? String(s.text).trim() : '';
        if (!t) return null;
        return '[這個聊天室更早以前的來往｜長期記憶]\n' + t
            + '\n\n上面是你們更早以前聊過的事，已經整理過、不是逐字紀錄。'
            + '接下來那些才是最近的原文。講到以前的事要跟上面對得起來，不要當作沒發生過。';
    }

    // 把一則訊息壓成一行給副模型看
    function _lineOf(msg, meName, taName) {
        if (!msg) return '';
        if (msg.type === 'system') {
            const t = String(msg.content || '').trim();
            return t ? '（' + t + '）' : '';
        }
        let text = String(msg.content || '');
        if (!text && msg.raw) {
            // raw 帶協議標頭（[Chat:…][With:…][Time:…]…）——那是給程式看的，不要餵進摘要
            text = String(msg.raw)
                .replace(/^\[[^\]\n]{1,40}\][ \t]*\n?/gm, '')
                .trim();
        }
        text = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (!text) return '';
        const who = msg.isMe ? meName : (msg.senderName || msg.sender || taName);
        return who + '：' + text;
    }

    function _userName() {
        try {
            if (win.OS_API && typeof win.OS_API.getGlobalUserName === 'function') return win.OS_API.getGlobalUserName();
        } catch (e) {}
        return '我';
    }

    // 讀「最新的那份」聊天室記錄：記憶體裡那份才是剛剛還在聊的，OS_DB 可能落後一拍
    async function _load(chatId) {
        try {
            const live = win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[chatId];
            if (live) return { chat: live, live: true };
        } catch (e) {}
        try {
            if (win.OS_DB && typeof win.OS_DB.getApiChat === 'function') {
                const c = await win.OS_DB.getApiChat(chatId);
                if (c) return { chat: c, live: false };
            }
        } catch (e) {}
        return { chat: null, live: false };
    }

    // 寫回：記憶體那份跟 OS_DB 都要寫，不然下一次存檔會把摘要蓋掉
    async function _save(chatId, chat) {
        try {
            const live = win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[chatId];
            if (live && live !== chat) live.wxSummary = chat.wxSummary;
        } catch (e) {}
        try { if (win.OS_DB && win.OS_DB.saveApiChat) await win.OS_DB.saveApiChat(chatId, chat); } catch (e) {}
        try { if (win.wxApp && typeof win.wxApp.saveChats === 'function') win.wxApp.saveChats(); } catch (e) {}
    }

    function _askSecondary(prompt, label) {
        return new Promise(function (resolve, reject) {
            try {
                if (!win.OS_API || typeof win.OS_API.chatSecondary !== 'function') {
                    reject(new Error('副模型還沒就緒'));
                    return;
                }
                win.OS_API.chatSecondary(
                    [{ role: 'system', content: prompt }],
                    null,
                    function (txt) { resolve(String(txt || '')); },
                    function (err) { reject(err || new Error('副模型沒有回應')); },
                    { label: label || '聊天室記憶整理' }
                );
            } catch (e) { reject(e); }
        });
    }

    function _buildPrompt(prevText, lines, taName) {
        const head = prevText
            ? ('下面第一段是這個聊天室先前已經整理好的記錄，第二段是後來又聊的內容（由舊到新）。'
                + '請把兩段併成**一段**新的記錄，取代舊的那段。')
            : ('下面是一個聊天室裡由舊到新的對話。請整理成**一段**記錄。');
        return head + '\n\n'
            + '整理的要求：\n'
            + '- 用第三人稱客觀敘述，不要分行條列，不要標題。\n'
            + '- 只留下之後還可能被提起、或會影響兩人關係與後續發展的事：講定的事、答應的事、'
            + '沒解決的事、身分與處境的變化、情緒上的轉折。\n'
            + '- 時間先後要看得出來；已經被後來的事推翻的舊狀況，寫成已經過去的。\n'
            + '- 寒暄、重複的話、單純的貼圖與表情不用留。\n'
            + '- 控制在 500 字以內。只輸出這段記錄本身，不要任何說明。\n\n'
            + (prevText ? ('【先前已整理的記錄】\n' + prevText + '\n\n') : '')
            + '【' + (prevText ? '後來又聊的內容' : '對話內容') + '】\n'
            + lines.join('\n');
    }

    // 整理一個聊天室。回 { ok, reason, folded, total }
    async function summarizeChat(chatId, opts) {
        opts = opts || {};
        if (!isEnabled() && !opts.force) return { ok: false, reason: '功能關著' };
        const got = await _load(chatId);
        const chat = got.chat;
        if (!chat) return { ok: false, reason: '找不到這個聊天室' };

        const p = plan(chat);
        if (!p.can && !opts.force) return { ok: false, reason: '還不用整理', plan: p };
        if (p.pending <= 0) return { ok: false, reason: '沒有可以整理的舊訊息', plan: p };

        const msgs = _msgs(chat);
        const meName = _userName();
        const taName = chat.name || '對方';

        // 這次要折的範圍；太長就只折最舊的一段，剩下的下次再折（免得一次餵爆）
        let end = p.foldTo;
        const lines = [];
        let chars = 0;
        let i = p.covered;
        for (; i < end; i++) {
            const ln = _lineOf(msgs[i], meName, taName);
            if (!ln) continue;
            if (chars + ln.length > FEED_MAX_CHARS && lines.length) break;
            lines.push(ln);
            chars += ln.length;
        }
        const newCovered = i;                       // 真正折到哪裡（可能提早收手）
        if (!lines.length) {
            // 這一段全是空的（純貼圖之類）——直接把指標推過去，不用花一次呼叫
            chat.wxSummary = Object.assign({}, chat.wxSummary || {}, {
                coveredCount: end, totalAtSummary: p.total, updatedAt: Date.now()
            });
            await _save(chatId, chat);
            return { ok: true, folded: end - p.covered, empty: true, total: p.total };
        }

        const prevText = (p.rebuild || !chat.wxSummary) ? '' : String(chat.wxSummary.text || '');
        const prompt = _buildPrompt(prevText, lines, taName);

        let out = '';
        try {
            out = await _askSecondary(prompt, '聊天室記憶整理｜' + taName);
        } catch (e) {
            console.warn('[WX_SUMMARY] 整理失敗（' + taName + '）:', (e && e.message) || e);
            return { ok: false, reason: (e && e.message) || '副模型沒回應' };
        }
        const text = String(out || '').replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, '\n').trim();
        if (!text) return { ok: false, reason: '副模型回了空的' };

        const prevCount = (chat.wxSummary && !p.rebuild) ? _int(chat.wxSummary.count, 0) : 0;
        chat.wxSummary = {
            text: text,
            coveredCount: newCovered,
            totalAtSummary: p.total,
            count: prevCount + 1,
            updatedAt: Date.now()
        };
        await _save(chatId, chat);
        console.log('[WX_SUMMARY] ' + taName + ' 已整理 ' + newCovered + '/' + p.total
            + ' 則（第 ' + chat.wxSummary.count + ' 次' + (p.rebuild ? '、重建' : '') + '）');
        return { ok: true, folded: newCovered - p.covered, covered: newCovered, total: p.total, rebuild: p.rebuild };
    }

    // 把當前這張卡底下所有該整理的聊天室都整理一遍。
    // 🚨 一個一個來，不要併發：這是背景工作，沒必要跟她正在聊的那則搶 API。
    async function summarizeAll(opts) {
        opts = opts || {};
        if (!isEnabled()) return { done: 0, skipped: 0, off: true };
        let all = {};
        try {
            if (win.OS_DB && typeof win.OS_DB.getApiChatsForCurrentCard === 'function') {
                all = await win.OS_DB.getApiChatsForCurrentCard();
            } else if (win.OS_DB && typeof win.OS_DB.getAllApiChats === 'function') {
                all = await win.OS_DB.getAllApiChats();
            }
        } catch (e) { console.warn('[WX_SUMMARY] 讀聊天室清單失敗', e); return { done: 0, skipped: 0 }; }

        let done = 0, skipped = 0;
        for (const id in all) {
            // 記憶體那份比較新，用它來判斷要不要跑
            let chat = all[id];
            try {
                const live = win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[id];
                if (live) chat = live;
            } catch (e) {}
            if (!plan(chat).can) { skipped++; continue; }
            const r = await summarizeChat(id);
            if (r && r.ok) done++; else skipped++;
        }
        if (done) console.log('[WX_SUMMARY] 大總結順便整理了 ' + done + ' 個聊天室（跳過 ' + skipped + ' 個）');
        return { done: done, skipped: skipped };
    }

    async function clearSummary(chatId) {
        const got = await _load(chatId);
        if (!got.chat) return false;
        delete got.chat.wxSummary;
        try {
            const live = win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[chatId];
            if (live) delete live.wxSummary;
        } catch (e) {}
        try { if (win.OS_DB && win.OS_DB.saveApiChat) await win.OS_DB.saveApiChat(chatId, got.chat); } catch (e) {}
        try { if (win.wxApp && typeof win.wxApp.saveChats === 'function') win.wxApp.saveChats(); } catch (e) {}
        return true;
    }

    async function setSummaryText(chatId, text) {
        const got = await _load(chatId);
        if (!got.chat) return false;
        const t = String(text || '').trim();
        if (!t) return clearSummary(chatId);
        got.chat.wxSummary = Object.assign({}, got.chat.wxSummary || {}, { text: t, updatedAt: Date.now() });
        await _save(chatId, got.chat);
        return true;
    }

    win.WX_SUMMARY = {
        isEnabled: isEnabled,
        keepOf: keepOf,
        minFold: minFold,
        plan: plan,
        recentWindow: recentWindow,
        injectionText: injectionText,
        summarizeChat: summarizeChat,
        summarizeAll: summarizeAll,
        clearSummary: clearSummary,
        setSummaryText: setSummaryText,
        KEEP_KEY: KEEP_KEY, MIN_KEY: MIN_KEY, ON_KEY: ON_KEY,
        DEF_KEEP: DEF_KEEP, DEF_MIN: DEF_MIN,
        _lineOf: _lineOf, _buildPrompt: _buildPrompt   // 給測試用
    };
})();
