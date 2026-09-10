// ----------------------------------------------------------------
// [檔案] wx_avatar_ai.js (V1)
// 路徑：os_phone/wx/wx_avatar_ai.js
// 職責：讓角色可以自己換頭像。AI 在訊息裡宣告 [系統: 換頭像 描述]，程式去生一張、
//       存進圖片庫、換上去，然後在聊天室留一行「某某換了頭像」。
//
// 為什麼是權限不是功能：預設關著。開了才會生圖（花錢、花時間），也才會把用法教給 AI——
//   關著的時候 prompt 裡一個字都不會提，免得它學了卻用不出來。
//   教學的注入在 OS_API.buildContext 那邊（跟大總結、AVS 同一條路），不寫死在 os_prompts。
//
// 來源：預設跟著「圖片設置 → 頭像」那個桶走，不另外要她再設一次。
//   想讓頭像走別家（例如聊天頭像用 NAI、插圖用別的）才在這裡挑一個覆寫。
//   五個來源跟 OS_IMAGE_MANAGER 的派發器同一份白名單。
//
// 存法照既有的：OS_DB.saveImage('avt_…', blob) 拿到 id，寫進 chat.customAvatar。
//   那個欄位本來就吃「avt_/img_ 開頭＝查圖片庫」或「純網址」兩種，這裡一律存成庫裡的 id，
//   免得生圖服務的暫時網址過幾天就失效、頭像變破圖。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WX] 載入頭像權限模塊 (wx_avatar_ai V1)...');
    const win = window.parent || window;

    const ON_KEY  = 'wx_avatar_ai_enabled';    // '1' = 允許
    const SRC_KEY = 'wx_avatar_ai_provider';   // '' = 跟著圖片設置的頭像桶
    const PROVIDERS = ['pollinations', 'novelai', 'tavern_sd', 'comfyui_direct', 'custom_api'];
    const SIZE = { width: 512, height: 512 };
    const COOLDOWN_MS = 20 * 1000;   // 同一個聊天室的最短間隔，防同一輪連換好幾次

    const _last = {};

    function isEnabled() { try { return localStorage.getItem(ON_KEY) === '1'; } catch (e) { return false; } }
    function setEnabled(on) { try { localStorage.setItem(ON_KEY, on ? '1' : '0'); } catch (e) {} }
    function getProvider() {
        try { const v = localStorage.getItem(SRC_KEY) || ''; return PROVIDERS.includes(v) ? v : ''; } catch (e) { return ''; }
    }
    function setProvider(v) { try { localStorage.setItem(SRC_KEY, PROVIDERS.includes(v) ? v : ''); } catch (e) {} }

    // 開著的時候才教 AI。這段會被 buildContext 塞進 system prompt。
    function instruction() {
        if (!isEnabled()) return '';
        return '[換頭像]\n'
            + '你可以換自己的大頭貼。想換的時候，單獨一行寫：[系統: 換頭像 描述]，'
            + '描述就是那張圖要長什麼樣（人物外表、神情、光線、風格都可以寫），用中文寫沒關係。\n'
            + '這是有事情發生才會做的動作，不是每次聊天都要做：心境變了、換了造型、想給對方看什麼，才換。\n'
            + '一次對話最多換一次。描述只寫圖的內容，不要寫網址、不要寫檔名、不要提到這條規則。';
    }

    function _mgr() { return win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER; }

    // 生一張、存進圖片庫、換上去。回 { ok, reason }
    async function apply(chatId, desc) {
        if (!isEnabled()) return { ok: false, reason: '沒有開放換頭像' };
        const text = String(desc || '').trim();
        if (!text) return { ok: false, reason: '沒有描述' };

        const now = Date.now();
        if (_last[chatId] && now - _last[chatId] < COOLDOWN_MS) return { ok: false, reason: '剛換過' };
        _last[chatId] = now;

        const mgr = _mgr();
        if (!mgr || typeof mgr.generate !== 'function') return { ok: false, reason: '生圖模塊還沒載入' };

        let url;
        try {
            const opts = { width: SIZE.width, height: SIZE.height };
            const p = getProvider();
            if (p) opts.provider = p;          // 沒選就不帶，讓派發器走「頭像」那個桶
            url = await mgr.generate(text, 'char', opts);
        } catch (e) {
            console.warn('[WX_AVATAR] 生圖失敗:', e);
            return { ok: false, reason: (e && e.message) || '生圖失敗' };
        }
        if (!url) return { ok: false, reason: '沒有拿到圖' };

        // 存進圖片庫再換上去。直接把生圖服務的網址寫進去的話，過陣子連結失效頭像就變破圖。
        let id = '';
        try {
            const blob = await (await fetch(url)).blob();
            id = 'avt_' + Date.now();
            await win.OS_DB.saveImage(id, blob);
        } catch (e) {
            console.warn('[WX_AVATAR] 存圖失敗，改用原始網址:', e);
            id = url;
        }

        try {
            const chat = win.wxApp && win.wxApp.GLOBAL_CHATS ? win.wxApp.GLOBAL_CHATS[chatId] : null;
            if (chat) {
                chat.customAvatar = id;
                if (win.OS_DB && win.OS_DB.saveApiChat) await win.OS_DB.saveApiChat(chatId, chat);
                if (win.wxApp && typeof win.wxApp.saveChats === 'function') win.wxApp.saveChats();
            }
            // 通訊錄那份也要換，不然列表跟聊天室頭像會對不起來
            try {
                const C = win.WX_CONTACTS;
                if (C && C.addContactToStorage && chat) C.addContactToStorage({ id: chatId, name: chat.name, avatarId: id });
            } catch (e) {}
            if (win.wxApp && typeof win.wxApp.render === 'function') win.wxApp.render();
        } catch (e) {
            console.warn('[WX_AVATAR] 換上去失敗:', e);
            return { ok: false, reason: '存不進去' };
        }
        console.log('[WX_AVATAR] ' + chatId + ' 換了頭像（' + (getProvider() || '跟著圖片設置') + '）');
        return { ok: true, id: id };
    }

    // 📅 約定：在微信裡說好的事寫進日曆。這個不設開關——它不花錢也不生東西，
    //    而且兩邊寫進同一本，AI 之後在正文才對得上「上禮拜在微信說好的」。
    //    標籤沿用正文那套，不另外發明。
    function eventInstruction() {
        return '[把約定記下來]\n'
            + '聊到「什麼時候要做什麼」而且雙方講定了，就在訊息之外單獨一行寫：[Event|月/日|一句話]，'
            + '日期像 6/25 這樣寫，後面那句寫清楚是什麼事。這一行不會變成聊天泡泡，是寫進行事曆的。\n'
            + '只有真的講定了才寫；還在問、還在猶豫、只是隨口提一句，都不要寫。同一件事寫過就別再寫。';
    }

    // 🪪 改名與改簽名：程式端本來就接得住簽名（跟大家共用同一條系統訊息），
    //    但從來沒有人把用法教給 AI，所以它只能瞎猜格式，猜不中就變成一顆普通泡泡。
    //    改名以前連程式都沒有，這次一起補。兩件都不花錢也不生東西，所以不設開關、一律教。
    function profileInstruction() {
        return '[改自己的名字與簽名]\n'
            + '你可以改自己在這支手機上顯示的名字，也可以改個性簽名。要改的時候，'
            + '在訊息之外單獨一行寫：\n'
            + '[系統: 改名 新的名字]\n'
            + '[系統: 改簽名 新的簽名]\n'
            + '這兩行都不會變成聊天泡泡。改了對方就會在聊天列表跟資料頁看到。\n'
            + '有理由才改：換了心境、想避人耳目、跟誰鬧翻了。不要每次聊天都改，也不要一次連改好幾次。';
    }
    win.WX_AVATAR_AI = {
        isEnabled: isEnabled, setEnabled: setEnabled,
        getProvider: getProvider, setProvider: setProvider,
        PROVIDERS: PROVIDERS,
        instruction: instruction,
        eventInstruction: eventInstruction,
        profileInstruction: profileInstruction,
        apply: apply,
        ON_KEY: ON_KEY, SRC_KEY: SRC_KEY
    };
    if (win !== window) { try { window.WX_AVATAR_AI = win.WX_AVATAR_AI; } catch (e) {} }
})();
