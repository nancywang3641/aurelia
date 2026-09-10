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
    // ── 讓角色看我的頭像 ────────────────────────────────────────
    // 🚨 圖只送一次。她換頭像那一輪把圖夾進去，同時要角色寫一句描述回來；
    //    描述存起來當長期記憶，之後每輪只注入那句文字，圖再也不送。
    //    這是她跟角色討論出來的做法，理由是對的：圖留在歷史裡會越積越重——
    //    創作室早就為了同一件事做了「只保留最近幾條帶圖訊息」的修剪器。
    //    判斷「換過了沒」不靠事件，靠比對「描述是哪張圖生的」，所以怎麼換都不會漏。
    const SEE_ON_KEY = 'wx_seeme_enabled';
    const SEE_MEM_KEY = 'wx_seeme_memory';   // 後面接 ::聊天室，一間一份
    const SEE_MAX_PX = 256;                  // 送出去之前縮到這個邊長，頭像不需要更大

    function seeEnabled() { try { return localStorage.getItem(SEE_ON_KEY) === '1'; } catch (e) { return false; } }
    function setSeeEnabled(on) { try { localStorage.setItem(SEE_ON_KEY, on ? '1' : '0'); } catch (e) {} }

    // 🚨 頭像是「每間聊天室各自一個」（聊天詳情裡的『我的頭像』＝chat.userAvatar），
    //    不是人設那顆。她第一次測就撞到：在聊天室換了自己的頭像，角色看到的還是預設問號，
    //    因為這裡本來讀的是人設系統那顆。沒設過的聊天室才退回人設頭像當底。
    //    既然頭像一間一個，它記住的描述當然也要一間一份，不然換間就對不上。
    function _memKey(chatId) { return SEE_MEM_KEY + '::' + String(chatId || 'default'); }
    function seeMemory(chatId) {
        try { const o = JSON.parse(localStorage.getItem(_memKey(chatId)) || 'null'); return (o && typeof o === 'object') ? o : null; } catch (e) { return null; }
    }
    function setSeeMemory(chatId, src, desc) {
        try { localStorage.setItem(_memKey(chatId), JSON.stringify({ src: String(src || ''), desc: String(desc || ''), ts: Date.now() })); } catch (e) {}
    }
    function clearSeeMemory(chatId) { try { localStorage.removeItem(_memKey(chatId)); } catch (e) {} }

    function myAvatarSrc(chatId) {
        try {
            const c = (win.wxApp && win.wxApp.GLOBAL_CHATS) ? win.wxApp.GLOBAL_CHATS[chatId] : null;
            if (c && c.userAvatar) return String(c.userAvatar);
        } catch (e) {}
        try { const P = win.WX_PROFILE; if (P && P.get) return String(P.get().avatar || ''); } catch (e) {}
        return '';
    }
    // 這間聊天室裡，它看過我現在這張頭像了沒？
    function seePending(chatId) {
        if (!seeEnabled()) return false;
        const src = myAvatarSrc(chatId);
        if (!src) return false;
        const m = seeMemory(chatId);
        return !(m && m.src === src && m.desc);
    }

    // 把頭像變成可以送出去的 data 網址，順便縮小。拿不到就回空的，讓呼叫端安靜跳過。
    async function myAvatarDataUrl(chatId) {
        const src = myAvatarSrc(chatId);
        if (!src) return '';
        let url = src;
        if (/^(img_|avt_)/.test(src)) {
            try { url = await win.OS_DB.getImage(src); } catch (e) { return ''; }
        }
        if (!url) return '';
        try {
            const img = await new Promise(function (res, rej) {
                const i = new Image();
                i.onload = function () { res(i); };
                i.onerror = rej;
                // crossOrigin 只對遠端網址有意義；掛在 data: 或 blob: 上反而會擋住載入
                if (/^https?:/i.test(url)) i.crossOrigin = 'anonymous';
                i.src = url;
            });
            const scale = Math.min(1, SEE_MAX_PX / Math.max(img.width || 1, img.height || 1));
            const c = win.document.createElement('canvas');
            c.width = Math.max(1, Math.round((img.width || SEE_MAX_PX) * scale));
            c.height = Math.max(1, Math.round((img.height || SEE_MAX_PX) * scale));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', 0.82);
        } catch (e) {
            // 畫不進 canvas（多半是跨網域）。本來就是 data 網址的話直接送就好——
            //    它已經是可以送出去的東西，只是沒縮到，不該因為縮不了就整個丟掉。
            if (/^data:image/i.test(url)) return url;
            return /^https?:/i.test(url) ? url : '';
        }
    }

    // 平時注入的那句話（便宜）。還沒看過就回空的。
    function seeMemoryText(chatId) {
        if (!seeEnabled()) return '';
        const m = seeMemory(chatId);
        if (!m || !m.desc) return '';
        if (m.src !== myAvatarSrc(chatId)) return '';   // 換過了，舊描述先不用
        return '[對方的大頭貼]\n' + m.desc + '\n這是他現在的大頭貼，你看過。除非他提起，不然不用主動講。';
    }

    // 只在「換了還沒看過」那一輪用：一則帶圖的訊息，順便要它寫一句回來。
    async function seeOnceMessage(chatId) {
        if (!seePending(chatId)) return null;
        const data = await myAvatarDataUrl(chatId);
        if (!data) return null;
        return {
            role: 'user',
            content: [
                { type: 'text', text: '（這是我現在的大頭貼，看一眼就好。'
                    + '看完在回覆的最後單獨一行寫：[系統: 頭像 一句話描述]，把你看到的寫下來，'
                    + '之後就不用再看圖了。那一行不會變成聊天訊息。不要在對話裡特地提這件事。）' },
                { type: 'image_url', image_url: { url: data } }
            ]
        };
    }
    // 它寫回來的描述：存起來，並記住是哪張圖生的
    function rememberSeen(chatId, desc) {
        const d = String(desc || '').trim();
        if (!d) return false;
        setSeeMemory(chatId, myAvatarSrc(chatId), d);
        return true;
    }

    win.WX_AVATAR_AI = {
        isEnabled: isEnabled, setEnabled: setEnabled,
        getProvider: getProvider, setProvider: setProvider,
        PROVIDERS: PROVIDERS,
        instruction: instruction,
        eventInstruction: eventInstruction,
        profileInstruction: profileInstruction,
        seeEnabled: seeEnabled, setSeeEnabled: setSeeEnabled,
        seeMemory: seeMemory, clearSeeMemory: clearSeeMemory,
        seePending: seePending, seeMemoryText: seeMemoryText,
        seeOnceMessage: seeOnceMessage, rememberSeen: rememberSeen,
        apply: apply,
        ON_KEY: ON_KEY, SRC_KEY: SRC_KEY
    };
    if (win !== window) { try { window.WX_AVATAR_AI = win.WX_AVATAR_AI; } catch (e) {} }
})();
