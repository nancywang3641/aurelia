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

    // 📲 統一「app 資料回傳酒館」：開關開的「純應用」app → 程式自動把它存的資料(saveData/dbSave)注入酒館，
    //    不靠 app 自己呼叫 remember、不用教生成 AI。共用/展示型(isBlock)會在劇情渲染→跳過防迴圈。
    const APPDATA_INJECT_ID = 'aurelia_app_data';
    const MAX_APPS = 6;          // 最多回傳幾個 app（防爆 token）
    const PER_APP_MAX = 1500;    // 每個 app 回傳字數上限
    let _lastAppDataUninject = null;

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
                depth: 2,   // 手機/工坊 app 記憶＝背景事實，放深一點(2)不搶戲；VN組件說明是格式規則維持 0 高注意
                role: 'system'
            }], { once: true });
            _lastUninject = (result && result.uninject) || null;
            console.log(`📱 [App Memory Injector] 注入 ${present.length} 個在場角色的手機近況（微信/微薄/電話）`);
        } catch (e) {
            console.warn('[App Memory Injector] 失敗:', (e && e.message) || e);
        }
    }

    // 🎴 VN組件說明注入：把「啟用中的 VN組件」使用說明(os_vn_extra_tags_prompt，由 syncActiveTagsToLocal
    //    在 啟用/停用 時即時組好)注入酒館原生生成 → 啟用/停用 = 馬上換注入層，取代手動貼世界書。
    var VN_TAGS_INJECT_ID = 'aurelia_vn_tags';
    var _lastVnTagsUninject = null;
    async function injectVnTags() {
        try {
            try { _lastVnTagsUninject && _lastVnTagsUninject(); } catch (e) {}
            _lastVnTagsUninject = null;
            if (win.__AURELIA_SUMMARIZING) return;
            if (win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()) return;  // 酒館 only
            if (!win.TavernHelper || !win.TavernHelper.injectPrompts) return;
            // 常駐組件：每輪都注（syncActiveTagsToLocal 已只放常駐的進這份）
            var constBlob = '';
            try { constBlob = localStorage.getItem('os_vn_extra_tags_prompt') || ''; } catch (e) {}
            // 關鍵字組件：抓最近約 3 輪正文＋這次使用者輸入，命中關鍵字才注入（省 token）
            var kwBlock = '';
            try {
                var raw = localStorage.getItem('os_vn_tags_keyword') || '';
                var kwList = raw ? JSON.parse(raw) : [];
                if (Array.isArray(kwList) && kwList.length && win.TavernHelper.getChatMessages) {
                    var lastId = 0;
                    try { lastId = await win.TavernHelper.getLastMessageId(); } catch (e) {}
                    var start = Math.max(0, (lastId || 0) - 5);   // 最近約 3 輪（user/AI 交錯，抓 6 則）
                    var msgs = [];
                    try { msgs = (await win.TavernHelper.getChatMessages(start + '-' + lastId)) || []; } catch (e) {}
                    var recent = msgs.map(function (m) { return (m && (m.message || m.mes)) || ''; }).join('\n').toLowerCase();
                    if (recent.trim()) {
                        var hit = kwList.filter(function (k) {
                            return k && Array.isArray(k.keywords) && k.keywords.some(function (w) {
                                w = String(w || '').trim().toLowerCase();
                                return w && recent.indexOf(w) !== -1;
                            });
                        });
                        if (hit.length) {
                            kwBlock = '# [📱模式｜VN組件·情境觸發] 下列面板因最近劇情提到相關內容而啟用，依格式在正文/區塊內使用：\n'
                                + hit.map(function (k) { return k.snippet; }).join('\n');
                        }
                    }
                }
            } catch (e) {}
            var spec = [String(constBlob).trim(), String(kwBlock).trim()].filter(Boolean).join('\n\n');
            if (!spec) return;
            var result = win.TavernHelper.injectPrompts([{
                id: VN_TAGS_INJECT_ID,
                content: spec,
                position: 'in_chat',
                depth: 0,
                role: 'system'
            }], { once: true });
            _lastVnTagsUninject = (result && result.uninject) || null;
            console.log('🎴 [VN Tags Injector] 注入 VN組件說明（常駐' + (kwBlock ? ' + 觸發命中' : '') + '）');
        } catch (e) { console.warn('[VN Tags Injector] 失敗:', (e && e.message) || e); }
    }

    // ── 💬 手機聊天室 ID 對照表：掃最近劇情的 [Chat: 名|ID]，每輪提醒 AI「沿用既有 ID、別因改群名而亂編」──
    //    （配合 wx 發現 tab 改成按 ID 分群：AI 改名沒關係，ID 不變就合回同一間）
    var WX_CHATROOM_INJECT_ID = 'aurelia_wx_chatroom_ids';
    var _lastWxRoomUninject = null;
    async function injectWxChatrooms() {
        try {
            try { _lastWxRoomUninject && _lastWxRoomUninject(); } catch (e) {}
            _lastWxRoomUninject = null;
            if (win.__AURELIA_SUMMARIZING) return;
            if (win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()) return;  // 酒館 only
            var th = win.TavernHelper;
            if (!th || !th.injectPrompts || !th.getChatMessages) return;
            var lastId = 0;
            try { lastId = await th.getLastMessageId(); } catch (e) {}
            // 掃全樓（去重靠 id）：跑團動輒上百樓、舊房間 id 也要記得；只掃最近 N 樓→久沒出現的房間 id 會掉、改群名就裂
            var msgs = [];
            try { msgs = (await th.getChatMessages('0-' + lastId)) || []; } catch (e) {}
            var text = msgs.map(function (m) { return (m && (m.message || m.mes)) || ''; }).join('\n');
            var map = {}, order = [];
            // ① WX 內文行格式 [Chat: 名|ID]
            var re = /\[Chat[:：]\s*([^|\]]+)\|([^\]]+)\]/g, m2;
            while ((m2 = re.exec(text)) !== null) { var nm = (m2[1] || '').trim(), id = (m2[2] || '').trim(); if (id) { if (!(id in map)) order.push(id); map[id] = nm; } }
            // ② VN PHONE 容器屬性格式 <chat chatroom="名" id="穩定id">（與 ① 同併一張表）
            var re2 = /<chat\s+([^>]*?)>/gi, m3;
            while ((m3 = re2.exec(text)) !== null) {
                var a = m3[1] || '';
                var id3 = ((a.match(/(?:^|\s)id\s*=\s*["']?([^"'>]*)["']?/i) || [])[1] || '').trim();
                if (!id3) continue;
                var nm3 = ((a.match(/chatroom\s*=\s*["']?([^"'>]*)["']?/i) || [])[1] || '').trim();
                if (!(id3 in map)) order.push(id3);
                if (nm3 || !(id3 in map)) map[id3] = nm3 || map[id3] || '';
            }
            if (!order.length) return;
            var table = order.map(function (id) { return map[id] + '｜' + id; }).join('、');
            var result = th.injectPrompts([{
                id: WX_CHATROOM_INJECT_ID,
                content: '【現有手機聊天室 ID 對照】下列房間「沿用」對應 ID（寫 <chat> 容器時用對 ID：可放 chatroom 旁的 id="…" 屬性，或容器內的 [Chat: 名|ID] 那行）；就算你改了群名也「絕不可」改 ID，只有全新房間才給新 ID：\n' + table,
                position: 'in_chat',
                depth: 0,
                role: 'system'
            }], { once: true });
            _lastWxRoomUninject = (result && result.uninject) || null;
            console.log('💬 [WX Chatroom ID Injector] 注入 ' + order.length + ' 間聊天室 ID 對照');
        } catch (e) { console.warn('[WX Chatroom ID Injector] 失敗:', (e && e.message) || e); }
    }

    function _safeParse(s) { try { return JSON.parse(s); } catch (e) { return s; } }
    function _flatten(v) { if (v == null) return ''; if (typeof v === 'string') return v.trim(); try { return JSON.stringify(v); } catch (e) { return String(v); } }
    // ⚠️ chatId 要跟 app 端 window.getChatId()(=ST.getCurrentChatId) 同源，否則 chat-scope 的 saveData/dbSave 對不上抓不到
    function _appChatId() { try { var ST = win.SillyTavern; if (ST && ST.getCurrentChatId) { var id = ST.getCurrentChatId(); if (id != null && id !== '') return String(id); } var c = ST && ST.getContext && ST.getContext(); if (c && c.chatId != null && c.chatId !== '') return String(c.chatId); } catch (e) {} return ''; }

    // 📲 統一注入：把「開了記憶回傳酒館」的純應用 app 自己存的資料抓出來注入主模型
    async function injectAppData() {
        try {
            try { _lastAppDataUninject && _lastAppDataUninject(); } catch (e) {}
            _lastAppDataUninject = null;
            if (win.__AURELIA_SUMMARIZING) return;
            if (win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()) return;   // 酒館 only
            if (!win.TavernHelper || !win.TavernHelper.injectPrompts) return;
            if (!_enabled()) return;
            if (!win.OS_DB || !win.OS_DB.getAllPhoneApps) return;

            const curCid = _appChatId();   // 與 app 端 window.getChatId() 同源，chat-scope 才對得上
            const apps = (await win.OS_DB.getAllPhoneApps()) || [];
            if (!apps.length) return;

            // 模板表查 isBlock：共用/展示(isBlock=true)會在劇情渲染→回傳會迴圈，跳過；只回純應用(isBlock=false)
            let tplById = {};
            try {
                const tpls = (win.OS_DB.getAllUITemplates ? (await win.OS_DB.getAllUITemplates()) : []) || [];
                tpls.forEach(function (t) { if (t && t.id != null) tplById[t.id] = t; });
            } catch (e) {}

            const blocks = [];
            for (let i = 0; i < apps.length && blocks.length < MAX_APPS; i++) {
                const app = apps[i];
                if (!app || app.id == null) continue;
                if (!_pluginEnabled(app.id)) continue;                      // 該 app「記憶回傳酒館」開關沒開
                const tpl = (app.srcTplId != null) ? tplById[app.srcTplId] : null;
                if (tpl && tpl.isBlock) continue;                           // 共用/展示型→跳(防迴圈)

                const parts = [];
                // dbSave（OS_DB app_data：global + 當前 chat）
                try {
                    if (win.OS_DB.getAppDataByApp) {
                        const rows = (await win.OS_DB.getAppDataByApp(app.id, curCid)) || [];
                        rows.forEach(function (r) { const t = _flatten(r.value); if (t) parts.push(t); });
                    }
                } catch (e) {}
                // saveData（localStorage：aurelia_appdata_<appId>_*；只收 global + 當前 chat）
                try {
                    const preG = 'aurelia_appdata_' + app.id + '_';
                    const preChatAny = preG + 'chat_';
                    const preChatCur = preG + 'chat_' + (curCid || '') + '_';
                    for (let k = 0; k < localStorage.length; k++) {
                        const key = localStorage.key(k);
                        if (!key || key.indexOf(preG) !== 0) continue;
                        if (key.indexOf(preChatAny) === 0 && key.indexOf(preChatCur) !== 0) continue;   // 別的 chat 的→跳
                        const t = _flatten(_safeParse(localStorage.getItem(key)));
                        if (t) parts.push(t);
                    }
                } catch (e) {}

                if (!parts.length) continue;
                let body = parts.join('\n').trim();
                if (body.length > PER_APP_MAX) body = body.slice(0, PER_APP_MAX) + '…';
                blocks.push('〔' + (app.name || 'App') + '〕\n' + body);
            }
            if (!blocks.length) return;

            const block = '<手機app資料 規則="下列是使用者手機 app 裡的資料（行程／清單／設定等），已開啟「回傳酒館」。當作既成事實、劇情需與之一致，別矛盾或遺忘。">\n'
                + blocks.join('\n\n') + '\n</手機app資料>';
            const result = win.TavernHelper.injectPrompts([{ id: APPDATA_INJECT_ID, content: block, position: 'in_chat', depth: 2, role: 'system' }], { once: true });
            _lastAppDataUninject = (result && result.uninject) || null;
            console.log('📲 [App Data Injector] 注入 ' + blocks.length + ' 個 app 的回傳資料');
        } catch (e) { console.warn('[App Data Injector] 失敗:', (e && e.message) || e); }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectAppMemory(); });   // dryRun 空跑不注入
            win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectVnTags(); });
            win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectWxChatrooms(); });
            win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectAppData(); });
        }
        if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, function () { try { _lastUninject && _lastUninject(); } catch (e) {} try { _lastVnTagsUninject && _lastVnTagsUninject(); } catch (e) {} try { _lastWxRoomUninject && _lastWxRoomUninject(); } catch (e) {} try { _lastAppDataUninject && _lastAppDataUninject(); } catch (e) {} _lastUninject = null; _lastVnTagsUninject = null; _lastWxRoomUninject = null; _lastAppDataUninject = null; });
        console.log('📱 [App Memory Injector] Ready（微信/微薄/電話 + VN組件 + app資料回傳）');
    }

    win.OS_APP_MEMORY_INJECT = {
        injectAppMemory: injectAppMemory,
        injectAppData: injectAppData,
        isEnabled: _enabled,
        setEnabled: function (v) { try { localStorage.setItem(FLAG_KEY, v ? '1' : '0'); } catch (e) {} },
        // 插件每-app 開關（展廳 UI 之後接這兩個）
        isPluginEnabled: _pluginEnabled,
        setPluginEnabled: function (appId, v) { try { localStorage.setItem('os_app_mem_plugin_' + appId, v ? '1' : '0'); } catch (e) {} }
    };
    init();
})();
