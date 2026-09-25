// ----------------------------------------------------------------
// [檔案] wx_summary.js (V2 — 一節一節)
// 路徑：os_phone/wx/wx_summary.js
// 職責：聊天室自己的長期記憶。早前的訊息每累積一段就整理成「一節」，接在後面、舊的不動；
//       送給模型時只帶「這幾節 ＋ 最近 N 則原文」，不再整串歷史全帶。
//
// 為什麼從「一段」改成「一節一節」（2026-09-14 她提的）：
//   V1 每次整理都把舊記錄跟新對話揉成一段、蓋掉原本那段——看不出哪天聊了什麼，整理壞了也救不回來。
//   現在：每 30 則左右寫一節（最多一次寫 3 節）→ 節數太長時最舊的幾節自動併成一節 → 也能手動勾幾節合併、改字、刪掉。
//
// 🚨 為什麼不用「索引指標」切歷史（沿用 V1）：
//   微信的訊息物件**沒有穩定 id**。注入時永遠只取 messages.slice(-keep)，不看指標 → 刪訊息也不可能漏。
//   生成時才用 coveredCount 決定從哪裡接著寫；發現總數比上次少（刪過訊息）就把指標往回退「少掉的那麼多則」，
//   寧可有幾則被重寫一次，也不跳過沒整理過的（V1 是整份重建；分節之後重建會把每節都重寫一遍，改成退指標）。
//
// 🧩 跟故事主線的關係（大總結）：
//   每節記 merged（寫進第幾次大總結）。大總結生成時 collectForStory() 收「還沒寫進故事」的節一起給主模型，
//   存檔後 markMerged() 蓋章，不會重複寫。以下不收：
//     · 關掉「吃這本的劇情」的聊天室（noHistory，隔離開關）——跟這個故事無關的人，例如測試用的系統助手
//     · storyOnly 的節——整段都是從正文同步進來的劇情聊天室（<chat>），正文本來就有
//   自動併節只併「已經寫進故事」（或不算進故事）的節，免得還沒寫進故事的內容被揉掉。
//
// 存哪：就存在 api_chat 那筆記錄裡（apiChat.wxSummary = { nodes:[…], coveredCount, totalAtSummary, count }），
//   加欄位**不用升 OS_DB 版本**。V1 的 { text } 讀到時自動變成第一節（id 'legacy'）。
// 誰來觸發：大總結存檔完順便跑一次（os_story_tools _doSave／PWA vn_summary）；聊天設置「早前記錄」手動整理。
// 用哪顆模型：副模型（chatSecondary）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WX] 載入聊天室記憶模塊 (wx_summary V2)...');
    const win = window.parent || window;

    const KEEP_KEY = 'wx_sum_keep_recent';   // 全域預設：注入時保留最近幾則原文
    const MIN_KEY  = 'wx_sum_min_fold';      // 累積這麼多沒整理過的才寫一節
    const ON_KEY   = 'wx_sum_enabled';       // '0' = 關掉整個功能
    const STREAM_KEY = 'wx_sum_stream';      // '0' = 關掉串流（端點不支援串流時用）

    const DEF_KEEP = 40;
    const DEF_MIN  = 30;
    const KEEP_MIN = 5;
    const KEEP_MAX = 500;
    const NODE_MSGS = 30;          // 一節最多吃幾則訊息
    const MAX_NODES_PER_RUN = 3;   // 一次最多寫幾節，剩下的下次再寫（背景工作，別一次打太多通）
    const NODE_BUDGET = 2400;      // 所有節加起來超過這麼多字 → 最舊的自動併
    const KEEP_RAW_NODES = 3;      // 最新的幾節不自動併
    // 單次餵給副模型的上限。實測 12000 會撞閘道逾時 524，砍半＋開串流。
    const FEED_MAX_CHARS = 6000;

    function _int(v, d) { const n = parseInt(v); return (isNaN(n) || n < 0) ? d : n; }
    function _clampKeep(n) { return Math.max(KEEP_MIN, Math.min(KEEP_MAX, n)); }
    function _newId() { return 'sn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function isEnabled() { try { return localStorage.getItem(ON_KEY) !== '0'; } catch (e) { return true; } }

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

    // 讀節：V1 只有一段 text 的，當成第一節（id 固定 'legacy'，兩邊讀到的才是同一節）
    function nodesOf(apiChat) {
        const s = apiChat && apiChat.wxSummary;
        if (!s) return [];
        if (Array.isArray(s.nodes)) return s.nodes;
        const t = s.text ? String(s.text).trim() : '';
        if (!t) return [];
        return [{ id: 'legacy', text: t, storyDate: '', merged: null, storyOnly: false, createdAt: s.updatedAt || 0 }];
    }
    // 要寫之前把舊形狀轉成新形狀
    function _ensureNodes(chat) {
        const nodes = nodesOf(chat).slice();
        const s = Object.assign({}, chat.wxSummary || {});
        delete s.text;
        s.nodes = nodes;
        chat.wxSummary = s;
        return nodes;
    }
    // 這一節算不算「已經處理完、不必再寫進故事」
    function _settled(chat, n) {
        return !!(chat && chat.noHistory === true) || !!(n && (n.merged || n.storyOnly));
    }

    // 現在這個聊天室該怎麼折。純計算，不碰 DB、不打 API。
    function plan(apiChat) {
        const msgs = _msgs(apiChat);
        const total = msgs.length;
        const keep = keepOf(apiChat);
        const s = (apiChat && apiChat.wxSummary) ? apiChat.wxSummary : null;

        // 刪過訊息（總數比上次整理當下還少）→ 指標往回退少掉的那麼多則：寧可重寫幾則，不准跳過
        const shrunk = !!(s && s.totalAtSummary != null && total < s.totalAtSummary);
        let covered = s ? _int(s.coveredCount, 0) : 0;
        if (shrunk) covered = Math.max(0, covered - (s.totalAtSummary - total));
        if (covered > total) covered = 0;

        const foldTo = Math.max(0, total - keep);
        const pending = Math.max(0, foldTo - covered);
        return {
            total: total, keep: keep, covered: covered, foldTo: foldTo,
            pending: pending, shrunk: shrunk,
            can: isEnabled() && pending >= minFold()
        };
    }

    function recentWindow(apiChat) {
        const msgs = _msgs(apiChat);
        const keep = keepOf(apiChat);
        return (msgs.length > keep) ? msgs.slice(-keep) : msgs;
    }

    function injectionText(apiChat) {
        if (!isEnabled()) return null;
        const nodes = nodesOf(apiChat).filter(function (n) { return n && String(n.text || '').trim(); });
        if (!nodes.length) return null;
        return '[這個聊天室更早以前的來往｜長期記憶，由舊到新一節一節]\n'
            + nodes.map(function (n) { return '・' + (n.storyDate ? n.storyDate + '｜' : '') + String(n.text).trim(); }).join('\n')
            + '\n\n上面是你們更早以前聊過的事，已經整理過、不是逐字紀錄。'
            + '接下來那些才是最近的原文。講到以前的事要跟上面對得起來，不要當作沒發生過。';
    }

    function _lineOf(msg, meName, taName, chat) {
        if (!msg) return '';
        // 🔒 對方沒收到的不寫進長期記憶：他刪了／拉黑了主角時主角打的；主角拉黑他、還沒放出來時主角打的
        if (msg.sentWhileBlocked || msg._blockedNotice) return '';
        if (msg.sentWhileMeBlocking && chat && chat.wxBlockedByMe) return '';
        if (msg.type === 'system') {
            const t = String(msg.content || '').trim();
            return t ? '（' + t + '）' : '';
        }
        // ↩ 撤回的內容不寫進長期記憶，只留「撤回了一則」
        if (msg.recalled) return '（' + (msg.isMe ? meName : (msg.senderName || msg.sender || taName)) + '撤回了一則訊息）';
        let text = String(msg.content || '');
        if (!text && msg.raw) {
            text = String(msg.raw).replace(/^\[[^\]\n]{1,40}\][ \t]*\n?/gm, '').trim();
        }
        text = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (!text) return '';
        const who = msg.isMe ? meName : (msg.senderName || msg.sender || taName);
        return who + '：' + text;
    }

    function _userName() {
        try { const me = win.WX_ME; if (me && me.name) { const n = me.name(); if (n) return n; } } catch (e) {}
        try {
            if (win.OS_API && typeof win.OS_API.getGlobalUserName === 'function') return win.OS_API.getGlobalUserName();
        } catch (e) {}
        return '我';
    }
    // 節上標的是故事裡的日期，不是她電腦的日期
    async function _storyDate() {
        try {
            const S = win.OS_MC_STATUS;
            if (S && S.load && S.fmtDate) {
                const st = await S.load();
                if (st && st.date) return S.fmtDate(st.date) + (st.time ? ' ' + st.time : '');
            }
        } catch (e) {}
        return '';
    }

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

    // 寫回：記憶體那份跟 OS_DB 都要寫，不然下一次存檔會把記錄蓋掉
    //   🚨 總結只改 wxSummary 這一欄：寫回時拿「最新的那份」掛上去，不拿開頭讀的整份蓋回去——
    //      等模型的這段時間電話、心跳可能又寫了訊息進來
    async function _save(chatId, chat) {
        let target = chat;
        try {
            const live = win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[chatId];
            if (live && live !== chat) { live.wxSummary = chat.wxSummary; target = live; }
            else if (!live && win.OS_DB && win.OS_DB.getApiChat) {
                const fresh = await win.OS_DB.getApiChat(chatId);
                if (fresh) { fresh.wxSummary = chat.wxSummary; target = fresh; }
            }
        } catch (e) {}
        try { if (win.OS_DB && win.OS_DB.saveApiChat) await win.OS_DB.saveApiChat(chatId, target); } catch (e) {}
        try { if (win.wxApp && typeof win.wxApp.saveChats === 'function') win.wxApp.saveChats(); } catch (e) {}
    }

    function _askSecondary(prompt, label) {
        return new Promise(function (resolve, reject) {
            try {
                if (!win.OS_API || typeof win.OS_API.chatSecondary !== 'function') {
                    reject(new Error('副模型還沒就緒'));
                    return;
                }
                let _stream = true;
                try { _stream = localStorage.getItem(STREAM_KEY) !== '0'; } catch (e) {}
                win.OS_API.chatSecondary(
                    [{ role: 'system', content: prompt }],
                    null,
                    function (txt) { resolve(String(txt || '')); },
                    function (err) { reject(err || new Error('副模型沒有回應')); },
                    { task: 'wx_summary', label: label || '聊天室記憶整理', stream: _stream }
                );
            } catch (e) { reject(e); }
        });
    }
    function _cleanOut(out) {
        return String(out || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, '\n').trim();
    }
    function _whyFailed(e) {
        const raw = (e && e.message) ? String(e.message) : '';
        const timeout = /(?:502|504|524|408)|timeout|timed out|逾時|超時/i.test(raw);
        return timeout ? '副模型太久沒回應，這次沒整理完。再按一次會接著整理。' : (raw || '副模型沒回應');
    }

    function _buildPrompt(prevText, lines, taName) {
        return '下面是一個聊天室裡由舊到新的一段對話。請把這一段整理成**一節**記錄。\n\n'
            + '整理的要求：\n'
            + '- 用第三人稱客觀敘述，不要分行條列，不要標題。\n'
            + '- 只留下之後還可能被提起、或會影響兩人關係與後續發展的事：講定的事、答應的事、'
            + '沒解決的事、身分與處境的變化、情緒上的轉折。\n'
            // 🧾 四項檢查（跟劇情記憶那份同一套，見 os_vector_engine 的 EXTRACTION_PROMPT）：
            //    這四類在聊的當下常常只是順口一句，可是一旦沒留下，之後的劇情或對話就會寫出跟它矛盾的內容。
            //    用「重不重要」篩會漏掉「當下不重要、後來才重要」的事，所以改成發生了就留。
            + '- 下面四類只要這一段裡發生了就一定要寫進去，就算當下看起來只是順口一句：\n'
            + '  ① 東西與錢的去向：轉帳、紅包、禮物、外送、借出去的、還回來的、說要給的——誰給誰、多少、最後收下了還是退回了、東西現在在誰那裡。\n'
            + '  ② 誰知道什麼：哪件事只告訴了這個聊天室裡的人、哪件事有人被瞞著、誰說了謊、誰以為的跟事實不一樣（兩邊都寫）。\n'
            + '  ③ 說出口的話：答應、拒絕、約好的時間地點、開出的條件、威脅。有日期、金額就照實寫。\n'
            + '  ④ 回不去的事：吵翻、刪好友或拉黑、告白、祕密被說破、關係改了名分。\n'
            + '  字數不夠的時候，先刪情緒與氣氛的描寫，這四類不准刪。\n'
            + '- 時間先後要看得出來。寒暄、重複的話、單純的貼圖與表情不用留。\n'
            + (prevText ? '- 下面附的「上一節」只是讓你接得上，上一節已經寫過的事不要再寫一次。\n' : '')
            + '- 控制在 250 字以內。只輸出這一節本身，不要任何說明。\n\n'
            + (prevText ? ('【上一節】\n' + prevText + '\n\n') : '')
            + '【這一段對話】\n'
            + lines.join('\n');
    }
    function _buildCompressPrompt(texts) {
        return '下面是同一個聊天室由舊到新的幾節記錄。請把它們併成**一節**，取代這幾節。\n\n'
            + '要求：\n'
            + '- 用第三人稱客觀敘述，不要分行條列，不要標題。\n'
            + '- 講定的事、答應的事、沒解決的事、身分處境與關係的變化都要留下；已經被後來的事推翻的舊狀況寫成已經過去的。\n'
            + '- 併的時候這四類一條都不准掉：東西與錢的去向（誰給誰、多少、現在在誰那裡）、誰知道什麼與誰被瞞著、答應過或約好的事（日期金額照寫）、回不去的事（吵翻、拉黑、告白、祕密說破）。要省字就省情緒與氣氛。\n'
            + '- 時間先後要看得出來。控制在 400 字以內。只輸出併好的這一節，不要任何說明。\n\n'
            + texts.map(function (t, i) { return '【第 ' + (i + 1) + ' 節】\n' + t; }).join('\n\n');
    }

    // 整理一個聊天室：從上次整理到的地方接著寫，一節最多 NODE_MSGS 則，一次最多 MAX_NODES_PER_RUN 節。
    // 回 { ok, reason, made, total }
    async function summarizeChat(chatId, opts) {
        opts = opts || {};
        if (!isEnabled() && !opts.force) return { ok: false, reason: '功能關著' };
        const got = await _load(chatId);
        const chat = got.chat;
        if (!chat) return { ok: false, reason: '找不到這個聊天室' };
        _ensureNodes(chat);

        const meName = _userName();
        const taName = chat.name || '對方';
        let made = 0, reason = '';
        for (let run = 0; run < MAX_NODES_PER_RUN; run++) {
            const p = plan(chat);
            if (p.pending <= 0) { reason = '沒有可以整理的舊訊息'; break; }
            if (!p.can && !(opts.force && run === 0)) { reason = '還不用整理'; break; }

            const msgs = _msgs(chat);
            const end = Math.min(p.foldTo, p.covered + NODE_MSGS);
            const lines = [];
            let chars = 0, i = p.covered, hasMsg = false, allStory = true;
            for (; i < end; i++) {
                const m = msgs[i];
                const ln = _lineOf(m, meName, taName, chat);
                if (!ln) continue;
                if (chars + ln.length > FEED_MAX_CHARS && lines.length) break;
                lines.push(ln);
                chars += ln.length;
                if (m && m.type !== 'system') { hasMsg = true; if (m._story == null) allStory = false; }
            }
            const s = chat.wxSummary;
            if (!lines.length) {
                // 這一段全是空的（純貼圖之類）——指標推過去就好，不用花一次呼叫
                s.coveredCount = i; s.totalAtSummary = p.total; s.updatedAt = Date.now();
                await _save(chatId, chat);
                continue;
            }
            const last = s.nodes[s.nodes.length - 1];
            let out = '';
            try {
                out = await _askSecondary(_buildPrompt(last ? String(last.text || '') : '', lines, taName), '聊天室記憶整理｜' + taName);
            } catch (e) {
                console.warn('[WX_SUMMARY] 整理失敗（' + taName + '）:', e);
                if (made) break;
                return { ok: false, reason: _whyFailed(e) };
            }
            const text = _cleanOut(out);
            if (!text) { if (made) break; return { ok: false, reason: '副模型回了空的' }; }
            s.nodes.push({
                id: _newId(), text: text, storyDate: await _storyDate(),
                storyOnly: hasMsg && allStory, merged: null, createdAt: Date.now()
            });
            s.coveredCount = i;
            s.totalAtSummary = p.total;
            s.count = _int(s.count, 0) + 1;
            s.updatedAt = Date.now();
            await _save(chatId, chat);
            made++;
            console.log('[WX_SUMMARY] ' + taName + ' 寫了一節（整理到 ' + i + '/' + p.total + ' 則，共 ' + s.nodes.length + ' 節）');
        }
        if (made) { try { await _autoCompress(chatId, chat); } catch (e) { console.warn('[WX_SUMMARY] 自動併節失敗', e); } }
        return made ? { ok: true, made: made, total: _msgs(chat).length } : { ok: false, reason: reason || '這次沒有整理' };
    }

    // 把 idxs 那幾節（照順序）併成一節，放在第一節的位置
    async function _combine(chatId, chat, idxs, label) {
        const nodes = chat.wxSummary.nodes;
        const picked = idxs.map(function (i) { return nodes[i]; });
        const out = _cleanOut(await _askSecondary(_buildCompressPrompt(picked.map(function (n) { return String(n.text || ''); })), label));
        if (!out) throw new Error('副模型回了空的');
        const first = picked[0], lastN = picked[picked.length - 1];
        const mergedCounts = picked.map(function (n) { return n.merged; }).filter(Boolean);
        const node = {
            id: _newId(),
            text: out,
            storyDate: (first.storyDate && lastN.storyDate && first.storyDate !== lastN.storyDate)
                ? first.storyDate + '～' + lastN.storyDate : (first.storyDate || lastN.storyDate || ''),
            storyOnly: picked.every(function (n) { return n.storyOnly; }),
            merged: mergedCounts.length === picked.length ? mergedCounts.reduce(function (a, b) { return (typeof a === 'number' && typeof b === 'number') ? Math.max(a, b) : (a || b); }) : null,
            combined: picked.reduce(function (a, n) { return a + (_int(n.combined, 0) || 1); }, 0),   // 一共揉了幾節原本的
            createdAt: Date.now()
        };
        const drop = {}; idxs.forEach(function (i) { drop[i] = 1; });
        const nextNodes = [];
        nodes.forEach(function (n, i) { if (i === idxs[0]) nextNodes.push(node); else if (!drop[i]) nextNodes.push(n); });
        chat.wxSummary.nodes = nextNodes;
        chat.wxSummary.updatedAt = Date.now();
        await _save(chatId, chat);
        return node;
    }

    // 太長了就把最舊、已經處理完的那一串併起來（最新 KEEP_RAW_NODES 節不動）
    async function _autoCompress(chatId, chat) {
        const nodes = nodesOf(chat);
        const chars = nodes.reduce(function (a, n) { return a + String(n.text || '').length; }, 0);
        if (chars <= NODE_BUDGET || nodes.length <= KEEP_RAW_NODES + 1) return false;
        let run = [];
        for (let i = 0; i < nodes.length - KEEP_RAW_NODES; i++) {
            if (_settled(chat, nodes[i])) run.push(i);
            else if (run.length >= 2) break;
            else run = [];
        }
        if (run.length < 2) return false;
        _ensureNodes(chat);
        await _combine(chatId, chat, run, '聊天室記憶併節｜' + (chat.name || ''));
        console.log('[WX_SUMMARY] ' + (chat.name || chatId) + ' 最舊的 ' + run.length + ' 節自動併成一節');
        return true;
    }

    async function summarizeAll(opts) {
        opts = opts || {};
        if (!isEnabled()) return { done: 0, skipped: 0, off: true };
        const all = await _allChats();
        let done = 0, skipped = 0;
        for (const id in all) {
            const chat = all[id];
            if (!plan(chat).can) { skipped++; continue; }
            const r = await summarizeChat(id);
            if (r && r.ok) done++; else skipped++;
        }
        if (done) console.log('[WX_SUMMARY] 順便整理了 ' + done + ' 個聊天室（跳過 ' + skipped + ' 個）');
        return { done: done, skipped: skipped };
    }
    // 這張卡底下的聊天室；記憶體那份比較新，用它
    async function _allChats() {
        let all = {};
        try {
            if (win.OS_DB && typeof win.OS_DB.getApiChatsForCurrentCard === 'function') all = await win.OS_DB.getApiChatsForCurrentCard();
            else if (win.OS_DB && typeof win.OS_DB.getAllApiChats === 'function') all = await win.OS_DB.getAllApiChats();
        } catch (e) { console.warn('[WX_SUMMARY] 讀聊天室清單失敗', e); return {}; }
        const out = {};
        for (const id in (all || {})) {
            let chat = all[id];
            try { const live = win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[id]; if (live) chat = live; } catch (e) {}
            if (chat) out[id] = chat;
        }
        return out;
    }

    // ── 手動：合併、改字、刪節 ────────────────────────────
    async function mergeNodes(chatId, ids) {
        const got = await _load(chatId);
        const chat = got.chat;
        if (!chat) return { ok: false, reason: '找不到這個聊天室' };
        const nodes = _ensureNodes(chat);
        const want = {}; (ids || []).forEach(function (x) { want[x] = 1; });
        const idxs = []; nodes.forEach(function (n, i) { if (want[n.id]) idxs.push(i); });
        if (idxs.length < 2) return { ok: false, reason: '至少勾兩節才能合併' };
        const settled = idxs.map(function (i) { return _settled(chat, nodes[i]); });
        if (settled.some(Boolean) && !settled.every(Boolean)) {
            return { ok: false, reason: '已經寫進故事的跟還沒寫進故事的要分開合併，不然還沒寫進去的會被當成寫過了' };
        }
        try {
            const node = await _combine(chatId, chat, idxs, '聊天室記憶合併｜' + (chat.name || ''));
            return { ok: true, node: node };
        } catch (e) { return { ok: false, reason: _whyFailed(e) }; }
    }
    async function updateNode(chatId, id, text) {
        const got = await _load(chatId);
        if (!got.chat) return false;
        const nodes = _ensureNodes(got.chat);
        const n = nodes.find(function (x) { return x.id === id; });
        const t = String(text || '').trim();
        if (!n || !t || n.text === t) return false;
        n.text = t;
        n.editedAt = Date.now();
        await _save(chatId, got.chat);
        return true;
    }
    async function deleteNode(chatId, id) {
        const got = await _load(chatId);
        if (!got.chat) return false;
        const nodes = _ensureNodes(got.chat);
        const next = nodes.filter(function (x) { return x.id !== id; });
        if (next.length === nodes.length) return false;
        got.chat.wxSummary.nodes = next;
        await _save(chatId, got.chat);
        return true;
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

    // ── 寫進故事主線（大總結）────────────────────────────
    // 收「還沒寫進故事」的節。回 { text, prompt, refs:[{chatId,nodeId}], chats, nodes }
    async function collectForStory() {
        const all = await _allChats();
        const blocks = [], refs = [];
        for (const id in all) {
            const chat = all[id];
            if (!chat || chat.noHistory === true) continue;   // 隔離：跟這個故事無關
            const nodes = nodesOf(chat).filter(function (n) { return n && !n.merged && !n.storyOnly && String(n.text || '').trim(); });
            if (!nodes.length) continue;
            const name = chat.name || id;
            const who = chat.isGroup ? '群聊「' + name + '」' : '跟 ' + name + ' 的私聊（含電話）';
            blocks.push(who + '：\n' + nodes.map(function (n) { return '- ' + (n.storyDate ? n.storyDate + '｜' : '') + String(n.text).trim(); }).join('\n'));
            nodes.forEach(function (n) { refs.push({ chatId: id, nodeId: n.id }); });
        }
        const text = blocks.join('\n\n');
        const prompt = text
            ? ('以下是這段時間手機上（微信聊天、電話）發生的事，已經按聊天室整理好，每一條前面是故事裡的日期。'
                + '其中會影響劇情、人物關係、約定、處境的事，照模板一併寫進這次總結對應的區塊（事件表照故事時間排進時間線）；'
                + '只是閒聊、不影響後續的不用寫。\n\n' + text)
            : '';
        return { text: text, prompt: prompt, refs: refs, chats: blocks.length, nodes: refs.length };
    }
    // 存檔成功之後蓋章：這幾節已經寫進第 summaryCount 次大總結
    async function markMerged(refs, summaryCount) {
        const by = {};
        (refs || []).forEach(function (r) { if (r && r.chatId) (by[r.chatId] = by[r.chatId] || []).push(r.nodeId); });
        let n = 0;
        for (const chatId in by) {
            const got = await _load(chatId);
            if (!got.chat) continue;
            const nodes = _ensureNodes(got.chat);
            const want = {}; by[chatId].forEach(function (x) { want[x] = 1; });
            nodes.forEach(function (node) { if (want[node.id] && !node.merged) { node.merged = summaryCount || true; n++; } });
            await _save(chatId, got.chat);
            // 蓋完章，太長的聊天室可以順手併節了（背景跑，不擋大總結）
            const chat = got.chat;
            _autoCompress(chatId, chat).catch(function (e) { console.warn('[WX_SUMMARY] 蓋章後併節失敗', e); });
        }
        if (n) console.log('[WX_SUMMARY] ' + n + ' 節已寫進第 ' + summaryCount + ' 次大總結');
        return n;
    }

    win.WX_SUMMARY = {
        isEnabled: isEnabled,
        keepOf: keepOf,
        minFold: minFold,
        plan: plan,
        nodesOf: nodesOf,
        recentWindow: recentWindow,
        injectionText: injectionText,
        summarizeChat: summarizeChat,
        summarizeAll: summarizeAll,
        mergeNodes: mergeNodes,
        updateNode: updateNode,
        deleteNode: deleteNode,
        clearSummary: clearSummary,
        collectForStory: collectForStory,
        markMerged: markMerged,
        KEEP_KEY: KEEP_KEY, MIN_KEY: MIN_KEY, ON_KEY: ON_KEY,
        DEF_KEEP: DEF_KEEP, DEF_MIN: DEF_MIN,
        _lineOf: _lineOf, _buildPrompt: _buildPrompt, _autoCompress: _autoCompress   // 給測試用
    };
})();
