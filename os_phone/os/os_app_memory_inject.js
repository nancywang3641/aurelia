// ----------------------------------------------------------------
// [檔案] os_app_memory_inject.js (V1)
// 路徑：os_phone/os/os_app_memory_inject.js
// 職責：把「角色在手機 app（微信/電話）上跟你的近期互動」反向注入酒館原生生成。
//       ──「唯讀注入、不貼回 chat」（跟狀態面板 state_runtime / 向量記憶 os_vector_inject 同款）──
//       所以不會造成「app 對話被複製進酒館正文 → app 又把酒館正文當記憶讀回 → 重複」的問題。
//       做法照 os_vector_inject.js：
//         GENERATION_STARTED → 掃最近幾樓酒館對話找「在場角色」→ 抓他們 OS_DB api_chats 的近期對話
//         → injectPrompts({once:true}) 塞進這一輪主模型 system prompt（用完即清、不寫進 chat）
//       只在「酒館（非獨立）」跑；scope 到當前劇情提到的角色 + 每人最近 N 條，避免脹 token。
// 依賴：window.TavernHelper.injectPrompts/getChatMessages/getLastMessageId、window.OS_DB.getAllApiChats
// 關閉：localStorage['os_app_mem_inject_enabled'] = '0'（預設開）
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('📱 [App Memory Injector] 載入');
    const win = window.parent || window;

    const INJECT_ID = 'aurelia_app_memory';
    const FLAG_KEY = 'os_app_mem_inject_enabled';
    const RECENT_SCAN = 8;     // 掃最近幾樓酒館對話，找「在場角色」
    const PER_CHAR_MSGS = 6;   // 每個在場角色帶最近幾條 app 對話
    const MAX_CHARS = 6;       // 最多注入幾個角色（防爆 token）
    const LINE_MAX = 80;       // 單行截斷字數
    let _lastUninject = null;

    function _enabled() { try { return localStorage.getItem(FLAG_KEY) !== '0'; } catch (e) { return true; } }
    function _clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
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

    // 一條 app 訊息 → 一行「誰：說了啥」（只取一般文字訊息，跳過紅包/貼圖/系統等）
    function _lineFor(m, userName, charName) {
        if (!m || (m.type && m.type !== 'msg')) return '';
        let t = _clean(m.content);
        if (!t) return '';
        if (t.length > LINE_MAX) t = t.slice(0, LINE_MAX) + '…';
        const who = m.isMe ? userName : (m.senderName || m.sender || charName);
        return `・${who}：${t}`;
    }

    async function injectAppMemory() {
        try {
            try { _lastUninject && _lastUninject(); } catch (e) {}
            _lastUninject = null;

            if (win.__AURELIA_SUMMARIZING) return;            // 大總結生成不摻
            if (win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()) return;  // 酒館 only
            if (!win.TavernHelper || !win.TavernHelper.injectPrompts) return;
            if (!_enabled()) return;
            if (!win.OS_DB || !win.OS_DB.getAllApiChats) return;

            const chats = (await win.OS_DB.getAllApiChats()) || {};
            const ids = Object.keys(chats);
            if (!ids.length) return;

            const recent = await _recentChatText();
            if (!recent) return;

            const userName = _userName();
            const present = [];
            for (let i = 0; i < ids.length; i++) {
                const c = chats[ids[i]];
                if (!c || c.isGroup) continue;                // v1 先不處理群聊
                const name = c.name || c.realName || '';
                if (!name || name.length < 2) continue;
                if (!recent.includes(name)) continue;         // 不在近期劇情提到 → 跳過（scope，省 token）
                if (!Array.isArray(c.messages) || !c.messages.length) continue;
                present.push(c);
                if (present.length >= MAX_CHARS) break;
            }
            if (!present.length) return;

            let block = `<手機記憶 規則="下列角色最近在手機 app（微信/電話）上跟${userName}的真實互動，都已經發生過。寫作時必須記得並延續，別當沒發生；這是記憶供你參考，不是要你照抄這個格式。">`;
            let any = false;
            for (let i = 0; i < present.length; i++) {
                const c = present[i];
                const name = c.name || c.realName;
                const lines = c.messages.slice(-PER_CHAR_MSGS).map(m => _lineFor(m, userName, name)).filter(Boolean);
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
            console.log(`📱 [App Memory Injector] 注入 ${present.length} 個在場角色的手機近況`);
        } catch (e) {
            console.warn('[App Memory Injector] 失敗:', (e && e.message) || e);
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, injectAppMemory);
        if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, function () { try { _lastUninject && _lastUninject(); } catch (e) {} _lastUninject = null; });
        console.log('📱 [App Memory Injector] Ready');
    }

    win.OS_APP_MEMORY_INJECT = {
        injectAppMemory: injectAppMemory,
        isEnabled: _enabled,
        setEnabled: function (v) { try { localStorage.setItem(FLAG_KEY, v ? '1' : '0'); } catch (e) {} }
    };
    init();
})();
