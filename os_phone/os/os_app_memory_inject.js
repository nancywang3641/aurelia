// ----------------------------------------------------------------
// [檔案] os_app_memory_inject.js (V2：wx + 電話 + 微薄)
// 路徑：os_phone/os/os_app_memory_inject.js
// 職責：把「角色在手機 app 上跟你的近期互動」反向注入酒館原生生成。
//       涵蓋三個預設應用：微信/電話(OS_DB api_chats) + 微薄(OS_DB wb_posts)。
//       ──「唯讀注入、不貼回 chat」（跟狀態面板 state_runtime / 向量記憶 os_vector_inject 同款）──
//       所以不會造成「app 對話被複製進酒館正文 → app 又把酒館正文當記憶讀回 → 重複」的問題。
//       做法照 os_vector_inject.js：
//         GENERATION_STARTED → 掃最近幾樓酒館對話找「在場角色」→ 抓他們 api_chats 對話 + wb_posts 動態
//         → injectPrompts({once:true}) 塞進這一輪主模型 system prompt（用完即清、不寫進 chat）
//       只在「酒館（非獨立）」跑；scope 到當前劇情提到的角色 + 每人最近 N 條，避免脹 token。
//       插件 app（創造室）：透過 st.remember 寫進統一桶 OS_DB.app_memory；每-app 開關
//       (localStorage 'os_app_mem_plugin_<appId>'，預設關)開了才注入；展廳 UI 之後做。
// 依賴：window.TavernHelper.injectPrompts/getChatMessages/getLastMessageId
//       window.OS_DB.getAllApiChats / getAllWbPosts
// 關閉：localStorage['os_app_mem_inject_enabled'] = '0'（預設開）
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('📱 [App Memory Injector] 載入');
    const win = window.parent || window;

    const INJECT_ID = 'aurelia_app_memory';
    const FLAG_KEY = 'os_app_mem_inject_enabled';
    const RECENT_SCAN = 8;      // 掃最近幾樓酒館對話，找「在場角色」
    const PER_CHAR_MSGS = 6;    // 每個在場角色帶最近幾條 微信/電話 對話
    const PER_CHAR_POSTS = 3;   // 每個在場角色帶最近幾則 微薄 動態
    const POST_COMMENTS = 3;    // 每則動態帶最近幾條留言
    const MAX_CHARS = 6;        // 最多注入幾個角色（防爆 token）
    const LINE_MAX = 80;        // 單行截斷字數
    let _lastUninject = null;

    function _enabled() { try { return localStorage.getItem(FLAG_KEY) !== '0'; } catch (e) { return true; } }
    function _clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s) { s = _clean(s); return s.length > LINE_MAX ? s.slice(0, LINE_MAX) + '…' : s; }
    function _userName() { try { if (win.OS_API && win.OS_API.getGlobalUserName) return win.OS_API.getGlobalUserName() || '你'; } catch (e) {} return '你'; }

    // 抓最近幾樓酒館對話文字（找在場角色用）
    async function _recentChatText() {
        try {
            const th = win.TavernHelper;
            if (!th || !th.getChatMessages) return '';
            let lastId = -1;
            try { lastId = await th.getLastMessageId(); } catch (e) {}
            let msgs;
            if (lastId >= 0) {
                const start = Math.max(0, lastId - (RECENT_SCAN - 1));
                msgs = await th.getChatMessages(`${start}-${lastId}`);
            } else {
                msgs = await th.getChatMessages(-1);
            }
            if (!Array.isArray(msgs)) return '';
            return msgs.map(m => m.message || m.mes || m.content || '').join('\n');
        } catch (e) { return ''; }
    }

    // 一條 微信/電話 訊息 → 一行（只取一般文字訊息，跳過紅包/貼圖/系統等）
    function _chatLine(m, userName, charName) {
        if (!m || (m.type && m.type !== 'msg')) return '';
        const t = _cut(m.content);
        if (!t) return '';
        const who = m.isMe ? userName : (m.senderName || m.sender || charName);
        return `・${who}：${t}`;
    }

    // 微薄：依作者(角色)分組（只收別人發的，isMe 是你自己發的不算角色記憶）
    async function _wbByAuthor(curCid) {
        try {
            if (!win.OS_DB || !win.OS_DB.getAllWbPosts) return {};
            const posts = (await win.OS_DB.getAllWbPosts()) || [];
            const by = {};
            for (let i = 0; i < posts.length; i++) {
                const p = posts[i];
                if (!p || p.isMe) continue;
                if (p.tavernChatId !== curCid) continue;      // 🔒 只收當前劇情的微薄
                const name = p.user;
                if (!name) continue;
                (by[name] = by[name] || []).push(p);
            }
            return by;
        } catch (e) { return {}; }
    }

    // 某角色的近期 微薄 動態 → 多行（發文 + 該文近期留言）
    function _wbLines(posts) {
        const out = [];
        const recent = posts.slice(-PER_CHAR_POSTS);
        for (let i = 0; i < recent.length; i++) {
            const p = recent[i];
            const c = _cut(p.content);
            if (c) out.push(`・發了微薄：${c}`);
            if (Array.isArray(p.comments) && p.comments.length) {
                p.comments.slice(-POST_COMMENTS).forEach(function (cm) {
                    const who = (cm && typeof cm === 'object') ? (cm.author || '') : '';
                    const txt = _cut((cm && typeof cm === 'object') ? cm.content : cm);
                    if (txt) out.push(`　└ ${who}：${txt}`);
                });
            }
        }
        return out;
    }

    // 插件記憶桶(app_memory)：每-app 小開關(localStorage，預設關)，開了才注入
    function _pluginEnabled(appId) { try { return localStorage.getItem('os_app_mem_plugin_' + appId) === '1'; } catch (e) { return false; } }
    async function _pluginMemByChar() {
        try {
            if (!win.OS_DB || !win.OS_DB.getAllAppMemory) return {};
            const recs = (await win.OS_DB.getAllAppMemory()) || [];
            const by = {};
            for (let i = 0; i < recs.length; i++) {
                const r = recs[i];
                if (!r || !r.charName || !Array.isArray(r.entries) || !r.entries.length) continue;
                if (!_pluginEnabled(r.appId)) continue;       // 該 app 開關沒開 → 跳過
                (by[r.charName] = by[r.charName] || []).push(r);
            }
            return by;
        } catch (e) { return {}; }
    }
    function _pluginLines(recs, curCid) {
        const out = [];
        for (let i = 0; i < recs.length; i++) {
            const es = recs[i].entries.filter(function (e) { return e && e.tavernChatId === curCid; }).slice(-PER_CHAR_MSGS);
            for (let k = 0; k < es.length; k++) {
                const t = _cut(es[k].text); if (!t) continue;
                const who = es[k].speaker || '';
                out.push(who ? `・${who}：${t}` : `・${t}`);
            }
        }
        return out;
    }

    async function injectAppMemory() {
        try {
            try { _lastUninject && _lastUninject(); } catch (e) {}
            _lastUninject = null;

            if (win.__AURELIA_SUMMARIZING) return;            // 大總結生成不摻
            if (win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()) return;  // 酒館 only
            if (!win.TavernHelper || !win.TavernHelper.injectPrompts) return;
            if (!_enabled()) return;
            if (!win.OS_DB) return;

            // 🔒 chatId 隔離：只注入「當前劇情」的 app 資料（跟 AVS 同款），避免換劇情/角色卡時冒出別劇情的手機數據
            const curCid = (win.OS_DB.currentChatId) ? win.OS_DB.currentChatId() : null;
            if (curCid == null) { console.warn('📱 [App Memory Injector] 取不到當前 chatId → 為免跨卡污染，本輪不注入'); return; }

            // 候選角色：名字 → { chat, posts }（微信/電話來自 api_chats、微薄來自 wb_posts）
            const cand = {};
            const chats = (win.OS_DB.getAllApiChats ? (await win.OS_DB.getAllApiChats()) : {}) || {};
            Object.keys(chats).forEach(function (id) {
                const c = chats[id];
                if (!c || c.isGroup) return;                  // v1 先不處理群聊
                if (c.tavernChatId !== curCid) return;        // 🔒 只收當前劇情建立的對話
                const name = c.name || c.realName || '';
                if (!name || name.length < 2) return;
                (cand[name] = cand[name] || {}).chat = c;
            });
            const wbBy = await _wbByAuthor(curCid);
            Object.keys(wbBy).forEach(function (name) {
                if (!name || name.length < 2) return;
                (cand[name] = cand[name] || {}).posts = wbBy[name];
            });
            const pluginBy = await _pluginMemByChar();
            Object.keys(pluginBy).forEach(function (name) {
                if (!name || name.length < 2) return;
                (cand[name] = cand[name] || {}).plugins = pluginBy[name];
            });
            const names = Object.keys(cand);
            if (!names.length) return;

            const recent = await _recentChatText();
            if (!recent) return;

            // scope：只留「劇情近期有提到名字」的角色
            const present = [];
            for (let i = 0; i < names.length && present.length < MAX_CHARS; i++) {
                if (recent.includes(names[i])) present.push(names[i]);
            }
            if (!present.length) return;

            const userName = _userName();
            let block = `<手機記憶 規則="下列角色最近在手機 app（微信/微薄/電話等）上跟${userName}的真實互動，都已經發生過。寫作時必須記得並延續，別當沒發生；這是記憶供你參考，不是要你照抄這個格式。">`;
            let any = false;
            for (let i = 0; i < present.length; i++) {
                const name = present[i];
                const info = cand[name];
                const lines = [];
                if (info.chat && Array.isArray(info.chat.messages)) {
                    info.chat.messages.slice(-PER_CHAR_MSGS).forEach(function (m) {
                        const l = _chatLine(m, userName, name); if (l) lines.push(l);
                    });
                }
                if (info.posts) _wbLines(info.posts).forEach(function (l) { lines.push(l); });
                if (info.plugins) _pluginLines(info.plugins, curCid).forEach(function (l) { lines.push(l); });
                if (!lines.length) continue;
                block += `\n〔${name}〕\n` + lines.join('\n');
                any = true;
            }
            block += `\n</手機記憶>`;
            if (!any) return;

            const result = win.TavernHelper.injectPrompts([{
                id: INJECT_ID,
                content: block.trim(),
                position: 'in_chat',
                depth: 0,
                role: 'system'
            }], { once: true });
            _lastUninject = (result && result.uninject) || null;
            console.log(`📱 [App Memory Injector] 注入 ${present.length} 個在場角色的手機近況（微信/微薄/電話）`);
        } catch (e) {
            console.warn('[App Memory Injector] 失敗:', (e && e.message) || e);
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, injectAppMemory);
        if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, function () { try { _lastUninject && _lastUninject(); } catch (e) {} _lastUninject = null; });
        console.log('📱 [App Memory Injector] Ready（微信/微薄/電話）');
    }

    win.OS_APP_MEMORY_INJECT = {
        injectAppMemory: injectAppMemory,
        isEnabled: _enabled,
        setEnabled: function (v) { try { localStorage.setItem(FLAG_KEY, v ? '1' : '0'); } catch (e) {} },
        // 插件每-app 開關（展廳 UI 之後接這兩個）
        isPluginEnabled: _pluginEnabled,
        setPluginEnabled: function (appId, v) { try { localStorage.setItem('os_app_mem_plugin_' + appId, v ? '1' : '0'); } catch (e) {} }
    };
    init();
})();
