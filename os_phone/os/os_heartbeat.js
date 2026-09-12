// ----------------------------------------------------------------
// [手機] os_heartbeat.js —— 角色主動找她（心跳）
// 職責：每間聊天室各自設定「他會不會主動找我、多久一次、機率多少」，
//       時間到就讓那個人自己開口，不是等她先講話。
//   ・手機開著：這裡每分鐘掃一次，到點就生一則，直接變成未讀訊息。
//   ・手機關著／鎖屏：她離開前把「等一下該誰開口」連同要送的那一包
//     預約到托管伺服器（os_relay.js），到點伺服器自己跑完，
//     **把生出來的那句話直接推到橫幅上**（她說「某某找你」太乾）。
//     一回到 app 就把還沒跑的預約整批取消重排——那些是拿舊情況排的。
// 兩道門檻（抄 OVO，缺一不可）：距上次他主動夠久、而且距最後一則訊息也夠久。
//   第二道才是「你剛聊完他不會馬上插話」。過了門檻再擲一次機率，沒中就等下一輪。
// 設定存在那間聊天室自己的資料上（wx_chat_settings 的「他會主動找我」）：
//   chat.hbOn（開關）、chat.hbMins（多久一次，分鐘）、chat.hbChance（機率 %）
//   chat.hbLast（上次他主動的時間）
// 對外：OS_HEARTBEAT.tickNow() / scheduleAhead() / clearAhead() / defaults()
// ----------------------------------------------------------------
(function () {
    const win = window.parent || window;
    const TICK_MS = 60 * 1000;
    const DEF = { mins: 180, chance: 60 };     // 沒設過的聊天室：三小時、六成
    const AHEAD_HOURS = 12;                    // 離開前最多排未來幾小時
    const PER_CHAT_MAX = 6;                    // 同一個人一次最多先排幾則（10 分鐘一次的話＝一小時份）
    const AHEAD_MAX = 3;                       // 一次最多排幾個人（省額度、也省她被連環叫）
    const KIND = 'heartbeat';
    const RE_TAIL_SLASH = new RegExp(String.fromCharCode(47) + '$');

    function _chats() {
        try { return (win.wxApp && win.wxApp.GLOBAL_CHATS) || {}; } catch (e) { return {}; }
    }
    function cfgOf(chat) {
        const mins = parseInt(chat && chat.hbMins, 10);
        const chance = parseInt(chat && chat.hbChance, 10);
        return {
            on: !!(chat && chat.hbOn),
            mins: (isFinite(mins) && mins > 0) ? mins : DEF.mins,
            chance: (isFinite(chance) && chance >= 0) ? Math.min(100, chance) : DEF.chance
        };
    }
    // 這間最後一則訊息的時間（她打的有 timestamp；劇情同步進來的沒有，就用同步時間退一步）
    function lastTalkAt(chat) {
        const ms = (chat && chat.messages) || [];
        for (let i = ms.length - 1; i >= 0; i--) {
            const t = ms[i] && ms[i].timestamp;
            if (t) return t;
        }
        return chat && chat.hbLast ? chat.hbLast : 0;
    }
    // 到點了沒（兩道門檻）。回 {due, chat, gapMs}
    function dueOf(chat, now) {
        const c = cfgOf(chat);
        if (!c.on || !chat || chat.isGroup || chat.wxRemoved || chat.wxBlocked) return null;
        const gap = c.mins * 60 * 1000;
        const last = chat.hbLast || 0;
        const talk = lastTalkAt(chat);
        if (now - last < gap) return null;      // 距上次他主動不夠久
        if (talk && now - talk < gap) return null;   // 距最後一則訊息不夠久（剛聊完不插話）
        return { chat: chat, gap: gap, chance: c.chance, at: Math.max(last, talk) + gap };
    }
    function roll(chance) { return Math.random() * 100 < chance; }

    // 要送出去的那一包：跟她自己按送出時同一條路（buildContext），多一段「現在是你主動開口」
    async function buildPayload(chat, nth) {
        const app = win.wxApp;
        if (!app || !win.WX_API || !win.OS_API) return null;
        const prev = app.GLOBAL_ACTIVE_ID;
        let messages = null;
        try {
            app.GLOBAL_ACTIVE_ID = chat.id;
            messages = await win.WX_API.buildContext(null);
        } catch (e) {
            console.warn('[心跳] 組上下文失敗:', (e && e.message) || e);
        } finally { app.GLOBAL_ACTIVE_ID = prev; }
        if (!Array.isArray(messages) || !messages.length) return null;
        const idle = lastTalkAt(chat) ? Math.round((Date.now() - lastTalkAt(chat)) / 3600000) : 0;
        messages.push({
            role: 'system',
            content: '【現在是你主動傳訊息給她，不是回覆】\n'
                + (idle ? '你們上一次講話大約是 ' + idle + ' 小時前。\n' : '')
                + (((nth || 0) > 0) ? '你剛剛已經傳過訊息，她還沒有回。又過了一陣子，你這次想說的是別的事，別重複剛才那幾句。' : '')
                + '照你的個性、你現在在做的事開口，寫一到三則短訊息。'
                + '不要提到這是安排好的，也不要問她是不是在等你。'
        });
        return messages;
    }

    // 手機開著時：真的生一則出來（走托管或手機自己跑都行，交給 WX_API.chat 決定）
    async function fire(chat) {
        const app = win.wxApp;
        if (!app) return false;
        const messages = await buildPayload(chat);
        if (!messages) return false;
        chat.hbLast = Date.now();
        let apiConfig = {};
        try { apiConfig = JSON.parse(localStorage.getItem('wx_phone_api_config') || '{}'); } catch (e) {}
        try { const S = win.OS_SETTINGS; if (S && S.getConfig) apiConfig = Object.assign({}, S.getConfig() || {}, apiConfig); } catch (e) {}
        console.log('[心跳] ' + (chat.name || chat.id) + ' 要主動找她了');
        return await new Promise(function (resolve) {
            win.WX_API.chat(messages, apiConfig, null,
                function (text) { win.wxApp.applyIncoming(chat, text).then(function () { resolve(true); }); },
                function (err) { console.warn('[心跳] 生成失敗:', err); resolve(false); },
                {
                    disableTyping: true,
                    relayJob: { app: 'wx', kind: KIND, chatId: chat.id, title: chat.name || '',
                        notify: { title: chat.name || '微信', useResult: true, url: './', tag: 'hb-' + chat.id } },
                    onQueued: function () { resolve(true); }
                });
        });
    }

    // 手機開著時的掃描
    async function tickNow() {
        const chats = _chats();
        const now = Date.now();
        for (const id in chats) {
            const d = dueOf(chats[id], now);
            if (!d) continue;
            if (!roll(d.chance)) { chats[id].hbLast = now; continue; }   // 沒中：這一輪跳過，重新計時
            await fire(chats[id]);
            try { if (win.WX_DB && win.WX_DB.saveApiChat) await win.WX_DB.saveApiChat(id, chats[id]); } catch (e) {}
            break;   // 一次只讓一個人開口
        }
    }

    // 她要離開了：把接下來該開口的人連同那一包預約到伺服器
    async function scheduleAhead() {
        const R = win.OS_RELAY;
        if (!R || !R.enabled()) return 0;
        const chats = _chats();
        const now = Date.now();
        const cands = [];
        for (const id in chats) {
            const chat = chats[id];
            const c = cfgOf(chat);
            if (!c.on || chat.isGroup || chat.wxRemoved || chat.wxBlocked) continue;
            const gap = c.mins * 60 * 1000;
            const at = Math.max(chat.hbLast || 0, lastTalkAt(chat)) + gap;
            if (at > now + AHEAD_HOURS * 3600 * 1000) continue;          // 太遠的不排
            if (!roll(c.chance)) continue;                                // 機率在排的時候就擲
            cands.push({ chat: chat, at: Math.max(at, now + 60 * 1000) });
        }
        cands.sort(function (a, b) { return a.at - b.at; });
        let n = 0;
        for (const cd of cands.slice(0, AHEAD_MAX)) {
            let apiConfig = {};
            try { apiConfig = JSON.parse(localStorage.getItem('wx_phone_api_config') || '{}'); } catch (e) {}
            try { const S = win.OS_SETTINGS; if (S && S.getConfig) apiConfig = Object.assign({}, S.getConfig() || {}, apiConfig); } catch (e) {}
            if (!apiConfig.url || !apiConfig.key) continue;               // 跟著酒館的沒有 key 可以交給伺服器
            let url = String(apiConfig.url).replace(RE_TAIL_SLASH, '');
            if (!url.includes('/chat/completions')) url += (url.endsWith('/v1') ? '' : '/v1') + '/chat/completions';

            // 一次排好接下來幾則，不是只排下一則。
            // 🚨 以前只排一則：她一直待在背景，那個人就只來過一次再也沒動靜（她說「觸發一次後再也沒有發生」）。
            //    排到 AHEAD_HOURS 為止、每人最多 PER_CHAT_MAX 則，每一則各擲一次機率。
            const gapMs = cfgOf(cd.chat).mins * 60 * 1000;
            const limit = now + AHEAD_HOURS * 3600 * 1000;
            let at = cd.at, k = 0;
            while (at <= limit && k < PER_CHAT_MAX) {
                if (k > 0 && !roll(cfgOf(cd.chat).chance)) { at += gapMs; k++; continue; }
                const messages = await buildPayload(cd.chat, k);
                if (!messages) break;
                const body = {
                    model: apiConfig.model, messages: messages, stream: false,
                    max_tokens: parseInt(apiConfig.maxTokens) || 2048,
                    temperature: isFinite(parseFloat(apiConfig.temperature)) ? parseFloat(apiConfig.temperature) : 1
                };
                try {
                    await R.submit({
                        app: 'wx', kind: KIND, chatId: cd.chat.id, title: cd.chat.name || '',
                        runAt: Math.round(at / 1000),
                        upstream: { url: url, key: apiConfig.key, body: body },
                        notify: { title: cd.chat.name || '微信', useResult: true, url: './', tag: 'hb-' + cd.chat.id }
                    });
                    cd.chat.hbLast = at;   // 排了就當它會發生，免得回來又排一次
                    n++;
                } catch (e) { console.warn('[心跳] 預約失敗:', (e && e.message) || e); break; }
                at += gapMs;
                k++;
            }
            try { if (win.WX_DB && win.WX_DB.saveApiChat) await win.WX_DB.saveApiChat(cd.chat.id, cd.chat); } catch (e) {}
        }
        if (n) console.log('[心跳] 預約了 ' + n + ' 個人在她不在的時候開口');
        return n;
    }

    // 回到 app：還沒跑的預約整批取消（那些是拿舊情況排的，等一下離開時會重排）
    async function clearAhead() {
        const R = win.OS_RELAY;
        if (!R || !R.enabled()) return;
        try {
            await fetch(R.base() + '/v1/schedule/clear', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + String(R.cfg().token || ''), 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: KIND })
            });
        } catch (e) { console.warn('[心跳] 取消預約失敗:', (e && e.message) || e); }
    }

    let _timer = null;
    function start() {
        if (_timer) return;
        _timer = setInterval(function () { tickNow().catch(function () {}); }, TICK_MS);
    }
    try {
        win.document.addEventListener('visibilitychange', function () {
            if (win.document.visibilityState === 'hidden') scheduleAhead().catch(function () {});
            else clearAhead().catch(function () {});
        });
    } catch (e) {}
    setTimeout(start, 8000);

    win.OS_HEARTBEAT = { tickNow: tickNow, scheduleAhead: scheduleAhead, clearAhead: clearAhead, cfgOf: cfgOf, dueOf: dueOf, defaults: function () { return Object.assign({}, DEF); } };
    if (win !== window) window.OS_HEARTBEAT = win.OS_HEARTBEAT;
    console.log('💓 [心跳] 已載入（角色主動找她）');
})();
