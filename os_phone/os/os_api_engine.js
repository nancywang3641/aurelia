// ----------------------------------------------------------------
// [檔案] os_api_engine.js (V3.24 - 終極完整版：支援 <vars_analyze> 思考鏈)
// 路徑：os_phone/os/os_api_engine.js
// 職責：組裝 Prompt 並負責與 AI 通訊。
//       AVS 底層引擎由 os_avs_engine.js 提供，本檔僅呼叫 win._AVS_ENGINE。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 API 引擎 (V3.24)...');
    const win = window.parent || window; // 🔥 絕對保留：雙通向架構的核心

    // ── 送出前把「半個表情符號」清掉 ──
    //   字串截尾（引用只取前幾個字、歷史砍尾、摘要）會把一個 emoji 切成兩半；JSON.stringify 遇到半個會寫成 \ud83d 這種逃逸，
    //   對方伺服器一讀就是 failed to read request body / invalid_json。她遇過：整包才兩萬多，不是太大，是壞字。
    //   走 JSON.stringify 的替換器，巢狀多深的字串都清；先用 regex 探一下，沒有代理字元的字串原樣放行。
    function _wellFormed(s) {
        if (!/[\uD800-\uDFFF]/.test(s)) return s;
        let out = '', dirty = false;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c >= 0xD800 && c <= 0xDBFF) {
                const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
                if (d >= 0xDC00 && d <= 0xDFFF) { out += s[i] + s[i + 1]; i++; }
                else dirty = true;
            } else if (c >= 0xDC00 && c <= 0xDFFF) { dirty = true; }
            else out += s[i];
        }
        if (dirty) _safeJson._dirty++;
        return dirty ? out : s;
    }
    function _safeJson(obj) {
        _safeJson._dirty = 0;
        const txt = JSON.stringify(obj, (k, v) => (typeof v === 'string' ? _wellFormed(v) : v));
        if (_safeJson._dirty) console.warn('[OS_API] 送出前清掉了 ' + _safeJson._dirty + ' 段含半個表情符號的字串（不清會被伺服器以 invalid_json 退回）');
        return txt;
    }
    _safeJson._dirty = 0;
    win.OS_SAFE_JSON = _safeJson;   // 托管那條（os_relay）也用同一支

    // AVS 快捷引用（os_avs_engine.js 必須在本檔之前載入）
    const _avsRead  = () => win._AVS_ENGINE?.read?.()       ?? {};
    const _avsApply = (t) => win._AVS_ENGINE?.apply?.(t);

    // ── 用量計數（CTX 面板用）：追蹤一輪劇情觸發幾次文字 API + 幾次生圖 ──
    //   tText/tImg = 本輪(本次主模型生成 → 下次生成之間)；text/img = 本次開啟累計。
    win.AURELIA_USAGE = win.AURELIA_USAGE || {
        text: 0, img: 0, tText: 0, tImg: 0,
        bumpText: function () { this.text++; this.tText++; },
        bumpImg:  function () { this.img++;  this.tImg++; },
        newTurn:  function () { this.tText = 0; this.tImg = 0; }
    };

    // ── 副/主模型輸出記錄環形緩衝（DEBUG 面板「副模型」「主模型」TAB 讀；每次呼叫存 prompt／原始輸出／狀態／耗時）──
    win.AURELIA_API_LOG = win.AURELIA_API_LOG || [];     // 🔥 全局：中央 chat 記「所有」文字呼叫(rec.cat=main/sec/aux + rec.route 用途)
    // 誰想跟著這份記錄動就掛在這裡（控制台的記錄頁靠它「新的來一筆就補一筆」，不是每幾秒整頁重畫）
    win.AURELIA_API_LOG_HOOKS = win.AURELIA_API_LOG_HOOKS || [];
    function _apiLogFire(kind, rec) {
        const hs = win.AURELIA_API_LOG_HOOKS || [];
        for (let i = 0; i < hs.length; i++) { try { hs[i](kind, rec); } catch (e) {} }
    }
    const SEC_LOG_MAX = 120;
    let _secSeq = 0;
    function _apiLogPromptText(messages) {
        try {
            return (messages || []).map(m => {
                const role = (m && m.role) || '?';
                let c;
                if (typeof m.content === 'string') c = m.content;
                else if (Array.isArray(m.content)) c = m.content.map(p => (p && p.text) || (p && p.type) || '').join('\n');
                else c = JSON.stringify(m && m.content);
                return '【' + role + '】\n' + c;
            }).join('\n\n');
        } catch (e) { return ''; }
    }
    // 送出前那包還會再長（前置指令插在最前面）：記錄那筆要換成真正送出去的那包。
    //   以前在入口就記死，控制台看到的永遠是插之前的 —— 她看記錄只有一段、以為前置指令沒帶。
    function _apiLogRefresh(rec, messages) {
        if (!rec) return;
        rec.prompt = _apiLogPromptText(messages);
        _apiLogFire('tok', rec);
        _estTok(_msgsText(messages)).then(n => { rec.inTok = n; _apiLogFire('tok', rec); }).catch(() => {});
    }
    function _apiLogStart(arr, messages) {
        // 記整包送出的 messages（標 role），DEBUG 面板「📤 送出 prompt」才看得到完整 sysPrompt＋上下文＋歷史；
        // 原本只撈最後一則 user → 跟 inTok（用整包估）對不起來，也看不到組好的人設/世界觀。
        const prompt = _apiLogPromptText(messages);
        const rec = { id: (++_secSeq), t: Date.now(), ok: null, ms: 0, prompt: prompt, raw: '', err: '' };
        try {
            arr.push(rec);
            while (arr.length > SEC_LOG_MAX) arr.shift();
        } catch (e) {}
        _apiLogFire('start', rec);
        return rec;
    }
    function _secLogEnd(rec, ok, payload) {
        if (!rec) return;
        rec.ok = !!ok;
        rec.ms = Date.now() - rec.t;
        if (ok) rec.raw = (typeof payload === 'string') ? payload : '';
        else rec.err = (payload && payload.message) ? payload.message : String(payload);
        _apiLogFire('end', rec);
    }
    // token 估算：優先用酒館 tokenizer；PWA/取不到 → 粗估(CJK≈1字1token、其餘≈4字1token)。非阻塞。
    async function _estTok(text) {
        const s = String(text || '');
        if (!s) return 0;
        try {
            const ST = win.SillyTavern || (win.parent && win.parent.SillyTavern);
            if (ST && typeof ST.getTokenCountAsync === 'function') return await ST.getTokenCountAsync(s);
        } catch (e) {}
        const cjk = (s.match(/[㐀-鿿豈-﫿぀-ヿ]/g) || []).length;
        return cjk + Math.ceil((s.length - cjk) / 4);
    }
    // 🧳 隔離開關（微信 → 那間 → 聊天設置）：從別的故事借過來的人，不該讀到「你這本」的
    //    世界書與劇情。她的話：「要不要吃當前世界書和當前歷史上下文」。
    //    🚨 只認手機聊天與通話那兩條路：大廳與工具型呼叫的 GLOBAL_ACTIVE_ID 可能還停在上一間聊天室，
    //       照著它隔離會誤傷。通話會把 GLOBAL_ACTIVE_ID 指到正在講電話的那個人，所以可以一起認。
    //       他們自己那間的對話記錄不受影響，永遠照給。
    function _wxIsolate(promptKey) {
        const off = { lore: false, story: false };
        if (promptKey !== 'wx_chat_system' && promptKey !== 'call_voice_system') return off;
        try {
            const app = win.wxApp;
            const id = app && app.GLOBAL_ACTIVE_ID;
            const c = (id && app.GLOBAL_CHATS) ? app.GLOBAL_CHATS[id] : null;
            if (!c) return off;
            return { lore: c.noLore === true, story: c.noHistory === true };
        } catch (e) { return off; }
    }

    // 📞 正在講的這一通從哪一則開始：最後一個「通話開始」，而且它後面沒有「通話結束」。
    //    回傳它在 windowMsgs（聊天歷史的尾巴那一段）裡的位置；還在響鈴、這一通還沒接通就回 -1。
    //    講很久、窗口切在這一通中間的話，整段都算這一通，回 0。
    //    🚨 以前歷史最後一律補「現在是新接起來的一通電話」，連這一通剛講過的話也被算成「以前」，
    //       模型每一輪都當成剛接起來：句句開頭「喂」、剛說好要測試轉頭就忘（2026-09-13 她抓到的）。
    function _openCallAt(windowMsgs, allMsgs) {
        const all = allMsgs || windowMsgs || [];
        let start = -1;
        for (let i = all.length - 1; i >= 0; i--) {
            const m = all[i];
            if (!m) continue;
            if (m._callEnd || m._missed) break;
            if (m._callStart) { start = i; break; }
        }
        if (start < 0) return -1;
        const offset = all.length - (windowMsgs || []).length;
        return Math.max(0, start - offset);
    }
    const _CALL_PAST_NOTE = '（以上都是以前發生過的對話與通話，不是現在。現在是新接起來的一通電話：先想清楚距離上次過了多久、這段時間裡發生過什麼，不要假設上次沒講完的話還在繼續，也不要假設上次借走、約好、拿走的東西還維持當時的狀態。）';
    // ⏰ 沒開時間感知的那一間，電話也一樣不提時間 —— 通話跟微信是同一個人、吃同一個開關。
    //   劇情上的連續性（上次借走、約好的東西）照樣要提醒，那跟她坐在電腦前多久沒關係。
    const _CALL_PAST_NOTE_NOTIME = '（以上都是以前發生過的對話與通話，不是現在。現在是新接起來的一通電話：不要去算距離上次過了多久，也不要提對方隔了多久才打來。'
        + '但不要假設上次沒講完的話還在繼續，也不要假設上次借走、約好、拿走的東西還維持當時的狀態。）';
    const _CALL_NOW_NOTE = '（以上都是以前發生過的對話與通話，不是現在。下面是現在正在講的這一通電話——早就接通了，下面每一句都是這一通裡剛剛才講過的話，順著講下去。）';

    // 把 messages 拼成純文字（多模態只取 text 片段）供估 token
    function _msgsText(messages) {
        try {
            return (messages || []).map(m => {
                if (typeof m.content === 'string') return m.content;
                if (Array.isArray(m.content)) return m.content.map(p => (p && p.text) || '').join(' ');
                return '';
            }).join('\n');
        } catch (e) { return ''; }
    }

    // 酒館主模型每次生成＝一輪起點：歸零本輪 + 主模型本身計一次。
    //   (副模型走 OS_API.chat、生圖走 image_manager，各自計數；大總結 generateRaw 也會觸發此事件→只計次、不重置輪)
    (function _hookUsageTurn() {
        if (!win.eventOn || !win.tavern_events || !win.tavern_events.GENERATION_STARTED) { setTimeout(_hookUsageTurn, 1000); return; }
        win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) {
            try {
                if (dryRun) return;   // 🚫 dryRun 空跑非真 API 呼叫 → 別計次(免 API 次數算錯)
                if (win.__AURELIA_SUMMARIZING) { win.AURELIA_USAGE.bumpText(); return; }
                win.AURELIA_USAGE.newTurn();
                win.AURELIA_USAGE.bumpText();
            } catch (e) {}
        });
    })();

    // --- 1. 核心清洗函數 ---
    // keepFences=true：跳過「吃 markdown 三反引號圍欄」那步。
    //   劇情顯示要砍圍欄（不想 ``` 字面跑進對話框），但創作室生成 JSON 程式碼時，
    //   AI 寫的 /```/g 之類三反引號是「資料」不是「顯示圍欄」，砍掉會把 /```/g 削成 //g（=註解）整段壞掉。
    function cleanRawOutput(text, keepFences) {
        if (!text || typeof text !== 'string') return text;
        let cleaned = text;

        const thinkBlocks = [];
        // 🔥 思考鏈剝離：CoT 用哪種標籤包都收（<think>/<thinking>/<thought(s)>/<reasoning>/<thinking_process>/<vars_analyze>），送入思考面板、不顯示進聊天
        cleaned = cleaned.replace(/<(think(?:ing)?|thoughts?|reasoning|thinking_process|vars_analyze)>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => {
            const trimmed = inner.trim();
            if (trimmed) thinkBlocks.push(`[${tag.toUpperCase()}]\n${trimmed}`);
            return ''; // 從最終顯示文本中剔除
        });
        // 原生推理模型/酒館常把思考包成 <details type="reasoning">…</details> → 一併剝掉，別漏進聊天
        cleaned = cleaned.replace(/<details\b[^>]*reasoning[^>]*>[\s\S]*?<\/details>/gi, '');
        
        if (thinkBlocks.length > 0 && win.OS_THINK) {
            win.OS_THINK.push(thinkBlocks.join('\n\n──────\n\n'), text);
        }

        if (thinkBlocks.length === 0) {
            const wxStart = cleaned.search(/<chat\b|\[wx_os\]|\[Chat:/i);
            if (wxStart > 20) {
                const preamble = cleaned.substring(0, wxStart).trim();
                if (preamble.length > 10 && win.OS_THINK) {
                    win.OS_THINK.push('[前置推理]\n' + preamble, text);
                    cleaned = cleaned.substring(wxStart);
                }
            }
        }

        // 🔥 AVS 系統：攔截 <vars> 動態變數（升級：更寬鬆的標籤匹配，防呆機制）
        cleaned = cleaned.replace(/<vars\b[^>]*>([\s\S]*?)<\/vars>/gi, (_, inner) => {
            console.log('🌟 [OS_API] 成功攔截 <vars> 區塊，轉交 AVS 引擎處理');
            try {
                _avsApply(inner.trim());
            } catch(e) {
                console.warn('[OS_API] <vars> 交接失敗:', e, inner);
            }
            return '';
        });

        // 🔥 終極修復：過濾 AI 幻覺產生的危險 HTML 標籤，防止 file:/// 模式下 iframe 渲染崩潰
        cleaned = cleaned.replace(/<(iframe|script|meta|link|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
        cleaned = cleaned.replace(/<(iframe|script|meta|link|object|embed)[^>]*\/?>/gi, '');

        if (!keepFences) {
            cleaned = cleaned.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1");
        }
        cleaned = cleaned.trim();
        return cleaned;
    }

    // --- 1.5. 歷史記錄 VN 格式清洗 ---

    // [Char|…] 有兩種欄數：一般模式 [Char|名|表情|「台詞」|Stay/Leave]、自由模式 [Char|名|「台詞」|Stay/Leave]，
    //   通話還有 [Char|名|表情|內容]／[Char|名|內容]。以前用一條只認五欄的規則抓「第三欄」當台詞，
    //   四欄的第三欄是 Stay，歷史裡就變成「角色名: Stay」。改成照欄位找：先剝掉尾巴的 Stay/Leave，
    //   台詞是帶「」或 *…* 的那一欄，都沒有就取剩下的最後一欄。
    function _charLine(inner, sep) {
        const f = String(inner || '').split('|');
        const name = String(f[1] || '').trim();
        let rest = f.slice(2).map(x => String(x || '').trim());
        while (rest.length > 1 && /^(stay|leave)$/i.test(rest[rest.length - 1])) rest.pop();
        let d = rest.find(x => /[「」*]/.test(x));
        if (d == null) d = rest.length ? rest[rest.length - 1] : '';
        if (!name) return '';
        return name + sep + d;
    }
    function stripVnTags(text) {
        if (!text || typeof text !== 'string') return '';
        let s = text;
        // 🔥 AVS 擴充：將 status、vars、vars_analyze 一併從歷史記錄中隱藏，不浪費 Token
        s = s.replace(/<(session_settlement|status|vars|vars_analyze)>[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<\/?(content|summary)>/gi, '');
        s = s.replace(/<(think(?:ing)?|thoughts?|reasoning|thinking_process)>([\s\S]*?)<\/\1>/gi, '');
        s = s.replace(/<details\b[^>]*reasoning[^>]*>[\s\S]*?<\/details>/gi, '');
        s = s.replace(/\[(Char\|[^\]\n]*)\]/g, (_, inner) => _charLine(inner, ': '));
        s = s.replace(/\[Nar\|([^|\]]+)(?:\|[^\]]+)?\]/g,
            (_, t) => `(${t.trim()})`);
        s = s.replace(/\[Inner\|[^|]+\|([^|\]]+)(?:\|[^\]]+)?\]/g,
            (_, t) => `(${t.trim()})`);
        s = s.replace(/\[Sys\|[^|]+\|([^\]]+)\]/g, (_, t) => t.trim());
        s = s.replace(/\[(Story|Chapter|Protagonist|Area|BGM|Bg|Trans|Item|SessionEnd|物證|人證|scene)[^\]]*\]/gi, '');
        s = s.replace(/\[[^\[\]\n]{1,60}\]/g, '');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/\n{3,}/g, '\n\n').trim();
        return s;
    }

    // --- 1.6. 微信 app：聊天室標頭與「這一間是誰」 ---
    //   每則存的 raw 前面都有 [Chat: 名|代號]＋[With: 名單]（重建聊天室要用），送給模型時拿掉：
    //   它每輪都看到就會每句照抄，抄錯代號還會長出一間空聊天室。發話人 [名字] 留著。
    function _wxStripHeads(text) {
        return String(text == null ? '' : text)
            .replace(/^[ \t]*\[\s*(?:Chat|With)\s*[:：][^\]\n]*\][ \t]*(?:\r?\n|$)/gim, '')
            .replace(/^\s*\n/, '');
    }
    // 這一間是誰、群裡有誰、還能傳到哪幾間。只給名字不給代號；回覆裡另開 <chat chatroom="名字"> 才會傳過去（wx_core _wxSplitRooms）
    function _wxRoomsNote(apiChat) {
        if (!apiChat) return '';
        let contacts = [];
        try { contacts = (win.WX_CONTACTS && win.WX_CONTACTS.getAllCustomContacts) ? (win.WX_CONTACTS.getAllCustomContacts() || []) : []; } catch (e) {}
        const nameOf = (id) => {
            const c = contacts.find(x => x && x.id === id);
            if (c && c.name) return c.name;
            return /^(?:char|grp|avt|wx)_/i.test(String(id || '')) ? '' : String(id || '');   // 對不到名字的代號不露出來
        };
        const isMeId = (id) => id === 'User' || id === 'user' || id === '我';
        const name = String(apiChat.name || '').trim();
        let note;
        if (apiChat.isGroup) {
            const mem = (apiChat.members || []).filter(id => !isMeId(id)).map(nameOf).filter(Boolean);
            note = '【這一間】群聊「' + name + '」' + (mem.length ? '，成員：' + mem.join('、') : '') + '。群裡每一行都寫是誰說的。';
        } else {
            note = '【這一間】跟「' + name + '」的私聊。';
        }
        let targets = [];
        try { targets = (win.wxApp && win.wxApp.roomTargets) ? (win.wxApp.roomTargets(apiChat.id) || []) : []; } catch (e) {}
        const tag = (t) => t.name + '＝' + t.id;
        const dm = targets.filter(t => t && !t.isGroup).map(tag).slice(0, 40);
        const gp = targets.filter(t => t && t.isGroup).map(tag).slice(0, 20);
        // 🚨 回這一間不要它寫代號：私聊代號長得像 char_105 這種三位數字，世界書一多、上下文裡同一類編號一堆，它常抄到別的，
        //    抄錯那一段就整個送不出去。沒寫代號本來就等於這一間，所以這裡只叫它寫 <chat>。
        note += '\n這一則回覆寫在 <chat> 裡，不用寫 id（要加 chatroom="' + name + '" 可以，只是給人看的）。';
        if (dm.length || gp.length) {
            note += '\n【可以傳到的聊天室】格式是「名字＝代號」：' + (dm.length ? '私聊：' + dm.join('，') : '') + (dm.length && gp.length ? '；' : '') + (gp.length ? '群聊：' + gp.join('，') : '')
                + '\n劇情上真的有人會另外傳訊息時，才再開一個 <chat id="那一間的代號">。'
                + '\n認人只認 id，一定要照抄；名字會被改、也分繁簡，寫了不算數。沒寫 id 的容器一律當成這一間。'
                + '\n清單以外的代號不會送出。';
        }
        return note;
    }

    // 兩條 buildContext 都在結尾叫這支：讀這一間、把代號清單推到整包最後（呼叫端接著才推她剛說的話）。
    async function _wxRoomsNoteLate(apiMessages, promptKey) {
        if (promptKey !== 'wx_chat_system') return;
        try {
            const _id = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
            if (!_id || !win.WX_DB || typeof win.WX_DB.getApiChat !== 'function') return;
            const _ac = await win.WX_DB.getApiChat(_id);
            const _rn = _ac ? _wxRoomsNote(_ac) : '';
            if (_rn) apiMessages.push({ role: 'system', content: _rn });
        } catch (e) {}
    }

    // 🖼 角色在微信裡自己動手的教學：換頭像（權限開了才教）、約定、改名改簽名、它記得我頭像的樣子。
    //   酒館版與獨立版兩條 buildContext 都叫這支——以前只寫在酒館那條，PWA 上的角色從來不知道能換頭像。
    function _wxAbilityBlocks(chatId) {
        const out = [];
        const push = (t) => { if (t) out.push({ role: 'system', content: t }); };
        try {
            const _av = win.WX_AVATAR_AI || (typeof window !== 'undefined' ? window.WX_AVATAR_AI : null);
            if (_av) {
                push(_av.instruction ? _av.instruction() : '');                  // 換頭像：權限關著回空字串＝一個字都不提
                push(_av.eventInstruction ? _av.eventInstruction() : '');        // 約定：不花錢，一律教
                push(_av.profileInstruction ? _av.profileInstruction() : '');    // 改名、改簽名：不花錢，一律教
                push(_av.seeMemoryText ? _av.seeMemoryText(chatId || '') : '');  // 它看過我頭像後自己寫的那句
            }
        } catch (e) {}
        push(_wxFriendBlock(chatId));                                             // 刪好友／拉黑／好友申請：不花錢，一律教
        return out;
    }

    // 🔒 刪好友與拉黑（wx_core 的 _applyFriendTags 收這幾個標籤）。私聊才教，照現在是不是好友給不一樣的一段。
    //   她正在送朋友驗證的那一輪不給這段（那一輪的指示由 sendFriendRequest 自己帶）。
    function _wxFriendBlock(chatId) {
        try {
            const chat = (win.wxApp && win.wxApp.GLOBAL_CHATS) ? win.wxApp.GLOBAL_CHATS[chatId] : null;
            if (!chat || chat.isGroup || chat.wxFriendReqOut) return '';
            let me = '';
            try { me = win.WX_ME ? String(win.WX_ME.name() || '').trim() : ''; } catch (e) {}
            me = me || '對方';
            const TAIL = '標籤名照抄英文，不要翻譯、不要改寫。';
            if (chat.wxBlockedByMe) {
                return '【你們現在不是微信好友】' + me + ' 把你加入了黑名單，你傳的訊息對方收不到。'
                    + '想請對方把你放出來，就寫 <friend_request>想對' + me + '說的附言</friend_request>，對方會在「新的朋友」裡看到；還不想就不要寫。' + TAIL;
            }
            if (chat.wxBlocked && chat.wxBlockKind === 'blocked') {
                return '【你把 ' + me + ' 拉黑了】這段時間對方傳的訊息你沒收到。要不要原諒是你說了算：'
                    + '想原諒就寫 <friend_unblock/> 把對方移出黑名單，要的話接著在 <chat> 裡傳訊息；還不想就不要寫。' + TAIL;
            }
            if (chat.wxBlocked) {
                return '【你們現在不是微信好友】你之前把 ' + me + ' 從微信刪掉了，這段時間對方傳的訊息你沒收到。'
                    + '想重新加回來就寫 <friend_request>想對' + me + '說的附言</friend_request>，對方會在「新的朋友」裡看到；還不想就不要寫。' + TAIL;
            }
            return '【刪好友與拉黑】劇情上你真的決定跟 ' + me + ' 斷開時，可以在回覆裡寫 <friend_delete/> 把對方從微信刪掉，或寫 <friend_block/> 把對方拉黑。'
                + '之後對方傳的訊息你都收不到，直到你們重新加回好友。' + TAIL;
        } catch (e) { return ''; }
    }

    // 🔒 拉黑期間的訊息怎麼給模型看：
    //   他刪了／拉黑了她時她打的（sentWhileBlocked）與那句系統提示：他從來沒收到 → 永遠不帶。
    //   她把他拉黑時她打的（sentWhileMeBlocking）：還在黑名單裡就不帶；放出來之後帶，前面寫一句旁註。
    function _wxBlockSkip(msg, apiChat) {
        if (!msg) return false;
        if (msg.sentWhileBlocked || msg._blockedNotice) return true;
        return !!(msg.sentWhileMeBlocking && apiChat && apiChat.wxBlockedByMe);
    }
    function _wxMeBlockNote(msg, prev, userName) {
        if (!msg || !msg.sentWhileMeBlocking || (prev && prev.sentWhileMeBlocking)) return '';
        return '（下面這幾則是 ' + String(userName || '主角') + ' 把你拉黑那段時間傳的，你當時沒收到，被放出黑名單之後才看到）';
    }

    // 🔁 酒館版與獨立版（PWA）兩條 buildContext 共用的微信／通話片段。以前各寫一份，PWA 那份一路漏：
    //   {{char}}/{{user}} 沒換、暱稱說明、世界書挑的人設與群聊備註、單間表情包庫、世界狀態的「別寫出來」、
    //   聊天記錄裡的系統行被當成對方講的話、通話分隔沒標日期、微信記錄沒有「以上都是以前」。
    //   🚨 微信／通話要送給模型的新東西，寫成這裡的一支，兩條都叫，不要只加在其中一條。

    function _wxResolveMacros(s, charName, userName) {
        return String(s == null ? '' : s).split('{{char}}').join(charName).split('{{user}}').join(userName);
    }

    // 微信暱稱：微信裡別人看到的是暱稱，不是人設真名。兩個不一樣時講清楚是同一個人，不然 [暱稱] 會被當成另一個角色
    function _wxNickNote(userName) {
        try {
            const nick = win.WX_ME ? String(win.WX_ME.name() || '').trim() : '';
            if (nick && nick !== userName) return `[微信暱稱] ${userName} 在微信裡把自己的名字設成「${nick}」，訊息前面的 [${nick}] 就是本人，在微信裡就叫這個名字，不要當成另一個角色。`;
        } catch (e) {}
        return '';
    }

    // 人設／群聊備註：自己打的那段＋世界書挑的那條（兩個都有時自己打的在前）
    function _wxJoinNote(custom, loreText) {
        const c = String(custom || '').trim();
        const l = String(loreText || '').trim();
        if (c && l) return `${c}\n\n---\n\n${l}`;
        return l || c;
    }

    // 世界書條目內容：有酒館就讀 TavernHelper（指定那本，沒指定用這張卡的主世界書）；
    //   PWA 讀 OS_WORLDBOOK 啟用中的條目——設置頁在 PWA 挑條目時存的 uid 就是條目 id。
    async function _wxLoreEntryText(uid, bookName) {
        if (uid == null || uid === '') return '';
        try {
            const H = win.TavernHelper;
            if (H && typeof H.getLorebookEntries === 'function') {
                const book = bookName || (typeof H.getCurrentCharPrimaryLorebook === 'function' ? H.getCurrentCharPrimaryLorebook() : '');
                if (!book) return '';
                const entries = await H.getLorebookEntries(book);
                const hit = (entries || []).find(e => e && e.uid === uid);
                return (hit && hit.content) || '';
            }
            if (win.OS_WORLDBOOK && typeof win.OS_WORLDBOOK.getEnabledEntries === 'function') {
                const entries = await win.OS_WORLDBOOK.getEnabledEntries();
                const hit = (entries || []).find(e => e && String(e.id) === String(uid));
                return (hit && hit.content) || '';
            }
        } catch (e) {}
        return '';
    }

    // 這一間指定的表情包庫（聊天設置 → 表情包庫）：只給名字清單
    function _wxStickerLibBlock(apiChat) {
        if (!apiChat || !apiChat.stickerLibId) return '';
        try {
            const libs = JSON.parse(localStorage.getItem('os_sticker_libs') || '[]');
            const lib = (libs || []).find(l => l && l.id === apiChat.stickerLibId);
            if (!lib || !lib.stickers || !lib.stickers.length) return '';
            const names = lib.stickers.map(s => String((s && s.name) || '').replace(/\.(gif|png|jpg|jpeg|webp)$/i, '')).join('\n');
            return `[Available 表情包]\nYou can ONLY use sticker names from this list. Use format: [表情包:名字]\n嚴禁自創，only choose from below:\n\n${names}`;
        } catch (e) { return ''; }
    }

    // 🧭 AVS 當背景給手機聊天與通話用（唯讀）。
    //   為什麼要：正文有寫「剛吃完牛肉麵、手上拿著誰的衣服」，但「這個角色現在對主角是什麼態度」
    //   是數值、不會寫在正文裡——沒有它，模型只能靠上下文猜語氣，同一個人一下熱情一下冷淡。
    //   🚨唯讀：這裡只給它看，不要求回報，也明令不准把數字或欄位名寫進訊息——一寫出來就是原始格式跑到畫面上。
    function _wxAvsBackground() {
        try {
            const bg = (win._AVS_ENGINE && win._AVS_ENGINE.read) ? win._AVS_ENGINE.read() : null;
            if (!bg || !Object.keys(bg).length) return '';
            return '[現在的世界狀態｜背景參考]\n' + JSON.stringify(bg)
                + '\n\n上面是主角此刻的處境，以及各個角色現在的狀態。用它決定你這幾則訊息該是什麼態度、'
                + '講到剛發生的事情時對得上。這是背景，不是要你回報的東西：'
                + '訊息裡不要提到上面的欄位名或數字，也不要輸出任何狀態、變數之類的格式。';
        } catch (e) { return ''; }
    }

    // ⏰ 時間感知：這一間要不要讓他知道現在幾點、上一則隔了多久（聊天設置一間一個，預設關）。
    //   為什麼預設關：她玩到一半去吃飯，回來不該被角色數落「怎麼一個多小時才回」；
    //   跑團更是如此 —— 故事裡的時間跟她坐在電腦前的時間本來就是兩回事。
    function _wxTimeAware(apiChat) {
        // 記憶體那份優先（她剛在設置切完就是最新的），沒有才看存檔 —— 跟 _wxIsolate 同一個讀法
        try {
            const app = win.wxApp, id = app && app.GLOBAL_ACTIVE_ID;
            const mem = (id && app.GLOBAL_CHATS) ? app.GLOBAL_CHATS[id] : null;
            if (mem && (!apiChat || !apiChat.id || mem.id === apiChat.id)) return mem.timeAware === true;
        } catch (e) {}
        return !!(apiChat && apiChat.timeAware);
    }

    // ⏰ 歷史結尾那句。開了時間感知才叫它想「過了多久」；沒開就明講不要算
    //   （原本不分開關一律叫它想，它手上又沒有真的時間 → 只能自己編一個數字出來）。
    function _wxPastNote(tAware) {
        const base = '（以上到這裡為止都是之前的對話，最後一則是你自己說的，你已經回過了。';
        return tAware
            ? base + '先想清楚距離現在過了多久，不要假設當時的情況還沒變。）'
            : base + _WX_NO_TIME_NOTE + '）';
    }

    // ⏰ 兩則之間隔了多久，講成人話。門檻以下不標 —— 正常一來一往的節奏不需要每則都寫。
    const _WX_GAP_MIN_MS = 30 * 60 * 1000;
    function _wxGapText(ms) {
        const n = Number(ms);
        if (!isFinite(n) || n < _WX_GAP_MIN_MS) return '';
        const mins = Math.round(n / 60000);
        if (mins < 60) return mins + ' 分鐘';
        const hrs = Math.floor(mins / 60), rem = mins % 60;
        if (hrs < 24) return hrs + ' 小時' + (rem >= 10 ? ' ' + rem + ' 分鐘' : '');
        const days = Math.round(hrs / 24);
        return days + ' 天';
    }
    // ⏰ 歷史裡兩則之間的空白：隔得夠久才插一句旁註。沒有時間戳的（舊記錄、AI 早期的回覆）算不出來就不標。
    function _wxGapNote(prev, cur) {
        const a = Number(prev && prev.timestamp), b = Number(cur && cur.timestamp);
        if (!a || !b || b <= a) return '';
        const t = _wxGapText(b - a);
        return t ? '（這裡隔了 ' + t + '）' : '';
    }
    // ⏰ 現在幾點：只給時分，不給日期 —— 日期是故事時鐘的事，兩個一起給會打架。
    function _wxNowClock() {
        try { return new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }); }
        catch (e) { return ''; }
    }
    // ⏰ 關掉時明講不要去算 —— 不寫這句，模型會自己從歷史裡的蛛絲馬跡編一個數字出來（她實測被說「等一個多小時」）。
    const _WX_NO_TIME_NOTE = '不要去算距離上一則過了多久，也不要提對方隔了多久才回、更不要因為這件事抱怨或質問。'
        + '就當成話還接得上，順著講下去。';

    // 📞 聊天記錄裡的系統行（通話開始／結束／未接聽、改名、紅包領取、換頭像…）不是誰講的話 → 寫成旁註。
    //   通話分隔用故事時鐘標出是哪一天、距今幾天；拿不到故事日期就只寫「之前」。stNow＝故事時鐘的當前日期。
    function _wxWhenText(d, stNow) {
        try {
            const S = win.OS_MC_STATUS;
            if (!d || !S || !S.fmtDate) return '';
            if (!stNow || !S.dayDiff) return S.fmtDate(d);
            const n = S.dayDiff(d, stNow);
            if (n <= 0) return '今天稍早';
            if (n === 1) return '昨天';
            if (n === 2) return '前天';
            return n + ' 天前（' + S.fmtDate(d) + '）';
        } catch (e) { return ''; }
    }
    function _wxSysNote(msg, stNow) {
        if (!msg) return '';
        const w = _wxWhenText(msg._storyDate, stNow);
        if (msg._callStart) return '（以下是' + (w || '之前') + '的一通電話）';
        if (msg._callEnd)   return '（那通電話到這裡結束）';
        if (msg._missed)    return '（' + (w || '之前') + '有一通沒接到的來電）';
        const t = String(msg.content || '').trim();
        return t ? '（' + t + '）' : '';
    }

    // ↩ 撤回的訊息怎麼給模型看：
    //   主角撤回自己的——後面有對方的訊息＝對方回過話、看過了，給內容；還沒回就撤回＝只知道撤回了一則，不給內容。
    //   角色撤回的——他自己知道說過什麼，給內容。一律寫成旁註，不是誰講的話（模型才不會學成輸出格式）。
    function _recallNote(msg, list, i, userName) {
        const text = String((msg && msg.content) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const me = String(userName || '主角');
        if (msg && msg.isMe) {
            const seen = (list || []).slice(i + 1).some(x => x && !x.isMe && x.type !== 'system' && x.type !== 'time' && !x.isLoading);
            return (seen && text) ? '（' + me + ' 傳了「' + text + '」，已經被看到，後來撤回了）' : '（' + me + ' 撤回了一則訊息，內容沒被看到）';
        }
        const who = String((msg && (msg.senderName || msg.sender)) || '').trim() || '對方';
        return text ? '（' + who + ' 傳了「' + text + '」又馬上撤回了）' : '';
    }

    // 🎯 這一輪她要他回的是「哪幾則」——整包 messages 最後面那一段。
    //   為什麼需要：以前這一間的訊息是一整串平鋪進去的，她剛打的那則跟三天前那則長得一模一樣，
    //   後面還接著四五段 system（記憶關聯、待處理紅包、連結內容、表情包清單），
    //   模型讀到的最後一段是表情包清單 —— 它根本不知道她剛剛說了什麼，只好在整串裡面挑一則看起來能回的，
    //   所以會回到半小時前那句、也會把回過的再回一次。
    //   切法：從「他上一則自己說的話」之後算起，全部都是還沒回的。
    //   為什麼不另外記一個「已回覆」旗標：她會刪訊息、會編輯、托管會晚一步寫回、還有兩台裝置，
    //   旗標一定會跟記錄對不上；而「他上一則之後」是從記錄本身讀出來的，永遠對得上。
    function _wxPendingSplit(msgs) {
        const list = Array.isArray(msgs) ? msgs : [];
        let at = -1;
        for (let i = list.length - 1; i >= 0; i--) {
            const m = list[i];
            if (!m || m.isLoading) continue;
            if (m.type === 'system' || m.type === 'time') continue;   // 系統行與日期分隔不是誰講的話
            if (!m.isMe) { at = i; break; }
        }
        return { pastEnd: at, pending: list.slice(at + 1) };
    }

    // 🎯 把「還沒回的那幾則」組成排在最後面的那一段。
    //   回傳陣列：夾在中間的系統行、撤回寫成旁註排前面，最後一則保證是 role:'user'，就是她講的話。
    //   清洗跟歷史那段一致（對方沒收到的不帶、單號不給看、照片換成它寫過的那句、剝 CoT）。
    function _wxPendingMessages(pending, apiChat, userName, stNow, lead, prevMsg) {
        const out = [];
        const lines = [];
        (pending || []).forEach((msg, _i) => {
            if (!msg || msg.isLoading) return;
            if (_wxBlockSkip(msg, apiChat)) return;
            { const _bn = _wxMeBlockNote(msg, pending[_i - 1], userName); if (_bn) out.push({ role: 'system', content: _bn }); }
            if (msg.type === 'time') return;
            if (msg.type === 'system') {
                const _note = _wxSysNote(msg, stNow);
                if (_note) out.push({ role: 'system', content: _note });
                return;
            }
            if (msg.recalled) {
                const _rn = _recallNote(msg, pending, _i, userName);
                if (_rn) out.push({ role: 'system', content: _rn });
                return;
            }
            let content = _wxStripHeads(msg.raw || msg.content || '');
            try { const _pt = win.wxApp && win.wxApp.photoContextText; if (_pt) content = _pt(msg, content); } catch (e) {}
            try { const _sc = win.wxApp && win.wxApp.stripCardIds; if (_sc) content = _sc(content); } catch (e) {}
            content = content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            if (content) lines.push(content);
        });
        if (lines.length) {
            const who = String(userName || '主角');
            // ⏰ 開了時間感知才給真正的時間：現在幾點、她距離上一則隔了多久。
            //   沒開就一個字都不提（不提也不叫它算，見 _WX_NO_TIME_NOTE）。
            let _when = '';
            if (_wxTimeAware(apiChat)) {
                const _g = _wxGapNote(prevMsg, (pending || []).find(function (m) { return m && m.timestamp; }));
                const _c = _wxNowClock();
                _when = (_c ? '\n現在是 ' + _c + '。' : '') + (_g ? (_c ? '' : '\n') + _g.replace('這裡隔了', '距離上一則隔了') : '');
            }
            out.push({ role: 'system', content: (lead || ('【這一輪要回的就是下面這'
                + (lines.length > 1 ? ' ' + lines.length + ' 則' : '一則') + '】\n'
                + who + ' 剛傳來、你還沒回的就這些。上面那些你都已經回過了，不要再回一次，也不要回到更早之前的話題。')) + _when });
            out.push({ role: 'user', content: lines.join('\n') });
        }
        return out;
    }

    // 🔗 記憶關聯：私聊這間勾了幾個群 → 帶那些群最近的訊息；群聊這間勾了幾間私聊 → 帶主角跟那些人私聊最近的訊息。
    //   設定在聊天設置「記憶關聯」（wx_chat_settings.js）。酒館版與獨立版兩條 buildContext 都呼叫這支。
    //   撤回的照 _recallNote 寫旁註（沒被看到的不給內容）、對方沒收到的不帶、單號拿掉。getChat(id) 回那一間的資料。
    const _WX_LINK_MAX_CHARS = 10000;
    async function _wxLinkedMemory(apiChat, userName, getChat) {
        if (!apiChat || typeof getChat !== 'function') return '';
        const toGroup = !apiChat.isGroup;
        const ids = toGroup ? apiChat.linkedGroupChats : apiChat.linkedPrivateChats;
        if (!Array.isArray(ids) || !ids.length) return '';
        const lim = Number(toGroup ? apiChat.groupMemoryMessageLimit : apiChat.privateMemoryMessageLimit);
        const per = lim >= 1 ? Math.min(Math.floor(lim), 500) : 50;
        const me = String(userName || '主角');
        let total = 0;
        const blocks = [];
        for (const id of ids) {
            if (total >= _WX_LINK_MAX_CHARS) break;
            if (!id || id === apiChat.id) continue;
            let other = null;
            try { other = await getChat(id); } catch (e) {}
            if (!other || !!other.isGroup !== toGroup || !Array.isArray(other.messages) || !other.messages.length) continue;
            const rawName = String(other.name || '').trim();
            const name = /^(?:char|grp|avt|wx)_/i.test(rawName) ? '' : rawName;   // 對不到名字的代號不露出來
            const list = other.messages.slice(-per);
            const lines = [];
            for (let i = 0; i < list.length; i++) {
                const msg = list[i];
                if (!msg || msg.isLoading || _wxBlockSkip(msg, other)) continue;
                if (msg.type === 'system' || msg.type === 'time') continue;
                let line = '';
                if (msg.recalled) {
                    line = _recallNote(msg, list, i, me);
                } else {
                    let text = String(msg.content || '') || _wxStripHeads(msg.raw || '').replace(/^\[[^\]\n]*\]\s*/, '');
                    try { const _pt = win.wxApp && win.wxApp.photoContextText; if (_pt) text = _pt(msg, text); } catch (e) {}
                    try { const _sc = win.wxApp && win.wxApp.stripCardIds; if (_sc) text = _sc(text); } catch (e) {}
                    text = String(text || '').replace(/<[^>]+>/g, '').trim();
                    if (!text) continue;
                    const who = (msg.isMe || msg.is_user) ? me
                        : (toGroup ? (String(msg.senderName || msg.sender || '').trim() || '某人') : (name || '對方'));
                    line = '[' + who + '] ' + text;
                }
                if (!line) continue;
                if (total + line.length + 1 > _WX_LINK_MAX_CHARS) { total = _WX_LINK_MAX_CHARS; break; }
                lines.push(line);
                total += line.length + 1;
            }
            if (lines.length) {
                blocks.push((toGroup ? '〔群聊「' + (name || '沒有名字的群') + '」〕' : '〔' + me + ' 跟 ' + (name || '某人') + ' 的私聊〕') + '\n' + lines.join('\n'));
            }
        }
        if (!blocks.length) return '';
        const head = toGroup
            ? '【關聯的群聊】以下是另外幾個群最近的訊息，只當背景，不是這一間的對話，不要在這一間接著回那些訊息。'
            : '【群裡有人跟 ' + me + ' 的私聊】以下是 ' + me + ' 分別跟某些人私聊最近的訊息。每一段私聊只有那兩個人知道，群裡其他人沒看過；誰在群裡開口，只能用他自己知道的事。';
        return head + '\n\n' + blocks.join('\n\n');
    }

    // --- 2. 輔助函數 ---
    function sanitizeContent(content) {
        if (!content || typeof content !== 'string') return content;
        if (content.trim().startsWith('{') && content.includes('"content"')) {
            try { const parsed = JSON.parse(content); if (parsed.content) return parsed.content; } catch (e) {}
        }
        return content;
    }

    function normalizeResponse(data, keepFences) {
        if (!data) return "";
        let rawContent = "";

        if (data.candidates && data.candidates[0]?.content?.parts) {
            const parts = data.candidates[0].content.parts;
            const thoughtParts = parts.filter(p => p.thought === true);
            const textParts    = parts.filter(p => p.thought !== true);
            if (thoughtParts.length > 0 && win.OS_THINK) {
                const t = thoughtParts.map(p => p.text || '').join('\n\n').trim();
                if (t) win.OS_THINK.push(t);
            }
            rawContent = textParts.map(p => p.text || '').join('');
        }
        else if (data.choices?.[0]?.message) {
            const msg = data.choices[0].message;
            const thinkText = msg.reasoning_content || msg.reasoning || msg.thinking || '';
            if (thinkText && win.OS_THINK) win.OS_THINK.push(String(thinkText).trim());
            rawContent = msg.content || '';
        }
        else if (typeof data === 'string') rawContent = data;
        // 有 content 欄位就用它，空字串也算：以前 "" 會落到下面的 JSON.stringify，
        // 把 {"content":"","reasoning":""} 整包當成模型的回答（DEBUG 綠勾、內容是一串 JSON）
        else if (typeof data.content === 'string') rawContent = data.content;
        else if (data.content) rawContent = data.content;
        else rawContent = JSON.stringify(data);

        return cleanRawOutput(rawContent, keepFences);
    }

    // 把錯誤的 cause 鏈攤平成一句話。酒館的 ConnectionManagerRequestService 對所有失敗一律
    // `throw new Error('API request failed', { cause: 真正的錯誤 })`(shared.js)，只看 message
    // 等於什麼都沒說；真正有用的是底層那句(如 "Secret id not found for api_key_vertexai: xxx"、
    // "Publisher Model ... was not found"、"Got response status 500")。
    function _causeText(err, depth) {
        if (!err) return '';
        const parts = [];
        let cur = err, n = 0;
        while (cur && n < (depth || 4)) {
            const m = (typeof cur === 'string') ? cur : (cur.message || cur.error || '');
            const s = String(m || '').trim();
            if (s && parts.indexOf(s) < 0) parts.push(s);
            cur = cur.cause;
            n++;
        }
        return parts.join('｜');
    }

    // 給 ConnectionManager.sendRequest 補 vertex 認證欄位：
    // ST 的 sendRequest 漏帶 vertexai_auth_mode → 後端預設 'express' → 服務帳號(full)被當 API Key 找不到金鑰
    // (Secret id not found for api_key_vertexai)。從 oai_settings 多來源讀回 auth_mode/project 塞進 overridePayload
    // (createRequestData 用 ...props 保留 → 整包送後端 /generate；後端讀 request.body.vertexai_auth_mode)。
    function _vertexOverride(ctx, profileId, base) {
        const ov = Object.assign({}, base);
        try {
            const oai = (ctx && ctx.oai_settings) || win.oai_settings || (win.parent && win.parent.oai_settings) || {};
            if (oai.vertexai_auth_mode) ov.vertexai_auth_mode = oai.vertexai_auth_mode;
            if (oai.vertexai_express_project_id) ov.vertexai_express_project_id = oai.vertexai_express_project_id;
            // 保底：全域讀不到、但這個 profile 是 vertexai → 預設服務帳號(full)。
            // (express 用戶全域 auth_mode 會是 'express'、上面已讀到、不會誤觸這條)
            if (!ov.vertexai_auth_mode) {
                const profs = (ctx && ctx.extensionSettings && ctx.extensionSettings.connectionManager && ctx.extensionSettings.connectionManager.profiles) || [];
                const p = profs.find(x => x && x.id === profileId);
                if (p && /vertex/i.test(p.api || '')) ov.vertexai_auth_mode = 'full';
            }
        } catch (e) {}
        return ov;
    }

    // sendRequest 會把「連接設定檔的預設」整份展開成生成參數，其中 top_k 就算是 0 也照樣進請求主體。
    // 酒館自己的生成路徑不送這個欄位（實測同一個站、同一個模型：酒館那筆沒有 top_k，走這裡的有 top_k:0），
    // 而 0 是 Gemini 明文拒絕的值（合法範圍 1~64）→ 轉發站原封不動轉給 Google 就吃 400 INVALID_ARGUMENT，
    // 變成「酒館聊天正常、奧瑞亞一律失敗」。0 是酒館 UI 表示「不啟用」的意思,不是使用者真的要 topK=0。
    // 只在它是 0/沒設的時候拿掉（設成 undefined → JSON.stringify 直接省略）；有真的填值的人不動。
    function _dropZeroTopK(ctx, ov) {
        try {
            const oai = (ctx && ctx.oai_settings) || win.oai_settings || (win.parent && win.parent.oai_settings) || {};
            if (Number(oai.top_k_openai)) return ov;          // 使用者真的填了值 → 一個字都不動
            ov.top_k = undefined;                             // ①前端這層先拿掉（設 undefined → JSON 序列化會省略）
            // ②後端那層再保一次：自訂端點的「排除請求主體參數」是請求送出前最後一道手續
            //   （後端 excludeKeysByYaml 直接 delete 掉那個 key），不管 top_k 是哪一層塞進來的都刪得掉。
            //   ①單獨不夠：奧瑞亞有好幾條送出路徑（選了設定檔的走 sendRequest、沒選的走直連 /generate），
            //   合併順序不是每條都一樣，只靠前端覆蓋會有路徑漏掉。沿用她既有的排除清單、只補這一行、不覆蓋。
            const cur = String((ov.custom_exclude_body != null ? ov.custom_exclude_body : oai.custom_exclude_body) || '');
            if (!/^\s*-\s*top_k\s*$/m.test(cur)) ov.custom_exclude_body = (cur.trim() ? cur.replace(/\s+$/, '') + '\n' : '') + '- top_k';
            else ov.custom_exclude_body = cur;
        } catch (e) {}
        return ov;
    }

    // profile 沒設 model（靠激活時的當前 model/preset 決定）→ sendRequest 直接送 profile.model=''（shared.js line448）→
    // vertex/gemini 報「Gemini request is missing model」(Model=? 就是這個)。補：profile 無 model 時把奧瑞亞 config.model
    // 塞進 overridePayload（shared.js line460 ...overridePayload 在 model 之後 → 蓋過空的 profile.model）。有設 model 的 profile 不動。
    function _ensureModelOverride(ctx, profileId, ov, cfgModel) {
        try {
            const profs = (ctx && ctx.extensionSettings && ctx.extensionSettings.connectionManager && ctx.extensionSettings.connectionManager.profiles) || [];
            const p = profs.find(x => x && x.id === profileId);
            if (p && p.model) return ov;   // profile 自帶 model → 交給 ST、不覆寫
            const m = (cfgModel && String(cfgModel).trim()) || '';
            if (m) ov.model = m;           // profile 沒 model → 用奧瑞亞 config.model 補上
        } catch (e) {}
        return ov;
    }

    function smartMergeMessages(msgList) {
        if (!msgList || msgList.length === 0) return [];
        const mergedList = [];
        let lastMsg = null;
        msgList.forEach(curr => {
            const currContent = curr.content || "";
            // 微信歷史已經拿掉標頭 → 呼叫端用 _chatKey 說是哪一間；還帶 [Chat:] 的舊寫法照舊認
            const chatMatch = currContent.match(/\[Chat:\s*(.*?)(?:\||\])/i);
            const currChatId = curr._chatKey || (chatMatch ? chatMatch[1] : null);
            const isProto = !!curr._chatKey || currContent.includes('[Chat:');

            if (lastMsg && lastMsg._isProto && isProto &&
                lastMsg.role === curr.role &&
                lastMsg._chatId && currChatId && 
                lastMsg._chatId === currChatId) {
                
                let body = currContent
                           .replace(/^\[Chat:[^\]]+\]\n?/im, '')
                           .replace(/^\[With:[^\]]+\]\n?/im, '')
                           .replace(/^\[Notice:[^\]]+\]\n?/im, '');
                if (body.trim()) { lastMsg.content = lastMsg.content.trim() + "\n" + body.trim(); }
            } else {
                const newObj = { role: curr.role, content: currContent, _isProto: isProto, _chatId: currChatId, _source: curr._source };
                mergedList.push(newObj);
                lastMsg = newObj;
            }
        });
        return mergedList;
    }

    // --- 3. OS API 主對象 ---
    win.OS_API = {

        // 📡 托管回來的是上游原樣的 JSON 字串 → 交回同一套清洗，結果才跟手機自己跑的一樣
        normalizeRaw: function (raw, keepFences) {
            let data = raw;
            if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch (e) { data = { content: raw }; } }
            return normalizeResponse(data, keepFences === true);
        },

        // ── 聊天引用回覆：微信與 VN 手機共用同一份 ──────────────────────────
        // 兩邊吃的是同一種行格式（[名字] 內容），所以解析、組裝、灰塊 HTML 都放這一份，
        // 別各寫各的——兩份一定會漂（通訊錄那次就是兩把尺分家造成的）。
        //
        // 寫法：引用標記放在「內容的最前面」，不動發話人那一格。
        //   [阿華] 今晚要不要去看那場
        //   [小明] [引用|阿華:今晚要不要去] 我剛好也想問這個
        // 為什麼不寫成 [小明:引用…]：解析器有一條硬規矩「方括號裡有冒號就不是發話人」
        //   （[圖片:…]、[Chat:…] 靠它擋），寫進去那行會整個不算一則訊息。
        // 為什麼帶 `|`：VN 標籤一律要帶 | 或 :，整行單一 [XXX] 會被載入層的區塊過濾整段吃掉。
        // 模型寫不出穩定的訊息 id，所以引用的是「說話人＋前幾個字」，靠 findTarget 往回找最近一則；
        // 找不到就照樣把灰塊畫出來（純文字），不會壞掉也不會擋住正文。
        chatQuote: {
            RE: /^\[\s*(?:引用|引用回覆|引用回复|Quote|Re)\s*[|｜]\s*([^\]:：]{1,24})\s*[:：]\s*([^\]]{0,60})\]\s*/,

            // 內容 → { name, text, rest }；沒有引用就 name/text 是空字串、rest 原樣
            parse: function (content) {
                const s = String(content == null ? '' : content);
                const m = s.match(this.RE);
                if (!m) return { name: '', text: '', rest: s };
                return { name: (m[1] || '').trim(), text: (m[2] || '').trim(), rest: s.slice(m[0].length) };
            },

            // 組回標記（她在微信裡手動引用時用）。片段截短，太長的引用塊在手機上會佔掉整個畫面
            build: function (name, text) {
                const n = String(name || '').trim().replace(/[\]|｜:：]/g, '').slice(0, 24);
                let t = String(text || '').replace(/\s+/g, ' ').trim().replace(/[\]]/g, '').slice(0, 30);
                if (!n || !t) return '';
                return '[引用|' + n + ':' + t + '] ';
            },

            // 往回找被引用的那一則：同一個人說的、內容從那段片段開頭。找不到回 -1。
            // 由後往前找，取最近的一則——同一句話重複出現時，引用的一定是剛剛那次。
            findTarget: function (msgs, quoteName, quoteText, beforeIdx) {
                if (!Array.isArray(msgs) || !quoteName || !quoteText) return -1;
                const end = (typeof beforeIdx === 'number' && beforeIdx >= 0) ? Math.min(beforeIdx, msgs.length) : msgs.length;
                const key = quoteText.replace(/\s+/g, '');
                for (let i = end - 1; i >= 0; i--) {
                    const m = msgs[i];
                    if (!m || m.type === 'system') continue;
                    const who = String(m.sender || '').trim();
                    if (who !== String(quoteName).trim()) continue;
                    const body = String(m.content || '').replace(/\s+/g, '');
                    if (body.indexOf(key) === 0 || body.indexOf(key) > -1) return i;
                }
                return -1;
            },

            // 灰塊 HTML。cls 讓兩邊各自套自己的主題（微信一套、VN 手機一套），結構共用
            html: function (name, text, cls) {
                if (!name || !text) return '';
                const esc = function (s) {
                    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                };
                return '<div class="' + (cls || 'chat-quote') + '"><span class="chat-quote-name">' + esc(name)
                     + '</span><span class="chat-quote-text">' + esc(text) + '</span></div>';
            },
        },

        // ── 插圖落點的「哪些不要選」：兩條插圖路共用一份 ──
        // 搭便車那條（本檔 extractScenes）與獨立插圖副模型那條（state_runtime 的 extractScenesStandalone）
        // 都叫這支，別各寫各的——兩份會漂，她改了一邊另一邊還是舊的。
        // 只有自訂接口要（她接的是 OpenAI 官方，站方會拒畫）；Pollinations／NAI／ComfyUI 什麼都畫得出來，回空字串。
        // 寫給不認識這個故事的人看：只講判準與替代做法，不給例句、不給關鍵詞清單——
        // 給了它會照著造句，也會把清單當成「要避開的詞」在提示裡繞著寫。
        sceneSafeRules: function (svc) {
            if (String(svc || '') !== 'custom_api') return '';
            return [
                '',
                'PICKING MOMENTS FOR THIS RUN:',
                'The image service used here refuses to draw sexual content and graphic bodily harm.',
                'A refused prompt produces nothing, so a refused moment is a wasted slot, not a picture.',
                '• Do not choose a moment whose image would be the sexual act or the bodily harm itself.',
                '• When such a moment is the dramatic peak, choose the beat just before it or just after it,',
                '  and let the image carry the same weight through what surrounds it — the place, the light,',
                '  the aftermath, a face, an object, what the body is doing that is not the wound.',
                '• Judge the picture, not the words: a violent passage can hold a perfectly drawable image,',
                '  and a calm passage can imply one that will be refused.',
                '• Never soften the story to fit this. Skip the slot instead — illustrations are optional here,',
                '  and fewer good ones beat a row of empty spots.',
            ].join('\n');
        },

        // 測試連線那邊也要用同一份（vertex 服務帳號少了 auth_mode 就會被當 API Key 找不到金鑰；
        // 錯誤訊息也要同樣攤平，不然只看得到酒館包的那句 API request failed）。
        // 這支現在連 top_k=0 一起處理：測試鈕跟生成走同一條 sendRequest、就會踩同一顆地雷，
        // 只修生成不修測試＝「測試失敗但實際能生成」，那正是這條路一直在犯的錯。
        _vertexOverride: (ctx, profileId, base) => _dropZeroTopK(ctx, _vertexOverride(ctx, profileId, base)),
        _causeText: (err) => _causeText(err),
        _dropZeroTopK: (ctx, obj) => _dropZeroTopK(ctx, obj),   // 自己組 body 的直連路徑也要能用同一道

        isStandalone: function() {
            try {
                const w = window.parent || window;
                return !(w.SillyTavern &&
                         typeof w.SillyTavern.getContext === 'function' &&
                         w.SillyTavern.getContext());
            } catch(e) { return true; }
        },

        getGlobalUserName: function() {
            let uName = "";
            try {
                const w = window.parent || window;
                if (w.OS_PERSONA && typeof w.OS_PERSONA.getName === 'function') {
                    const pName = w.OS_PERSONA.getName();
                    if (pName && pName.trim() !== 'User') uName = pName.trim();
                }
                if (!uName && !this.isStandalone() && w.SillyTavern?.getContext) {
                    const stCtx = w.SillyTavern.getContext();
                    if (stCtx?.user?.name && stCtx.user.name.trim() !== 'User') {
                        uName = stCtx.user.name.trim();
                    }
                }
            } catch(e) {}
            return uName || "User";
        },

        /**
         * 場景插圖分析：把劇情文本送給副模型，讓它在適當位置插入 [Scene|id|prompt] 標籤
         * @param {string} storyText   - 已提取的 <content> 劇情文本
         * @param {function} onFinish  - callback(enhancedText) 回傳插入了 [Scene|] 的增強版文本
         * @param {function} [onError] - callback(err) 錯誤處理
         */
        analyzeSceneInserts: function(storyText, onFinish, onError) {
            const imgCfg   = (win.OS_SETTINGS?.getImageConfig?.()) || {};
            const sceneCfg = imgCfg.sceneGen || {};

            if (!sceneCfg.enabled) { onFinish(storyText); return; }

            const specPrompt = (sceneCfg.specPrompt || '').trim();
            if (!specPrompt) { onFinish(storyText); return; }

            // ── 依「插圖來源」決定 prompt 格式指令：NAI → 標籤、其餘 → 自然語言 ──
            const _globalSvc = ((typeof win.OS_IMAGE_MANAGER?.serviceFor === 'function') ? win.OS_IMAGE_MANAGER.serviceFor('scene') : (win.OS_IMAGE_MANAGER?.config?.service)) || 'pollinations';
            const _useNatural = _globalSvc !== 'novelai';

            const _taskInstruction = _useNatural ? [
                'Analyze the story and output a JSON array of scene-insertion points.',
                'Each object has two fields:',
                '  "after"  — a SHORT phrase (5-20 chars) copied VERBATIM from the story,',
                '             identifying the line AFTER which the scene should appear.',
                '  "prompt" — vivid natural-language English description of the scene (no tag syntax, no commas as separators).',
                '',
                'OUTPUT: raw JSON array only — no markdown fences, no explanation, nothing else.',
                '',
                'EXAMPLE:',
                '[',
                '  {"after": "她推開了門", "prompt": "a girl standing in a doorway bathed in golden sunset light, cinematic mood"},',
                '  {"after": "握住她的手腕", "prompt": "close-up of two hands clasped together, soft dramatic lighting"}',
                ']',
                '',
                'ANCHOR RULES:',
                '• Copy "after" exactly as it appears in the story — do NOT paraphrase.',
                '• Pick a phrase near the END of the target line so it pinpoints that location.',
                '• If no suitable visual moment exists, output: []',
                '',
                'Scene description style rules (apply when writing the "prompt" field):',
                '──────────────────────────────────────────────────────────────────'
            ].join('\n') : [
                'Analyze the story and output a JSON array of scene-insertion points.',
                'Each object has two fields:',
                '  "after"  — a SHORT phrase (5-20 chars) copied VERBATIM from the story,',
                '             identifying the line AFTER which the scene should appear.',
                '  "prompt" — Danbooru image prompt tags for that scene (see format rules below).',
                '',
                'OUTPUT: raw JSON array only — no markdown fences, no explanation, nothing else.',
                '',
                'EXAMPLE:',
                '[',
                '  {"after": "她推開了門", "prompt": "1girl, doorway, sunset, medium_shot"},',
                '  {"after": "握住她的手腕", "prompt": "2girls, hand_holding, close-up"}',
                ']',
                '',
                'ANCHOR RULES:',
                '• Copy "after" exactly as it appears in the story — do NOT paraphrase.',
                '• Pick a phrase near the END of the target line so it pinpoints that location.',
                '• If no suitable visual moment exists, output: []',
                '',
                'Scene prompt format rules (apply when writing the "prompt" field):',
                '──────────────────────────────────────────────────────────────────'
            ].join('\n');

            // ── 自訂接口（她接的是 OpenAI 官方那條）：站方會拒畫的段落，這裡就不要選 ──
            // 選了也生不出來，那一段落空；不如一開始就挑別的落點。這段只在插圖來源是自訂接口時加，
            // 其他來源（Pollinations／NAI／ComfyUI）什麼都畫得出來，不該被這條綁住。
            // 寫給不認識這個故事的人看：只講判準與替代做法，不給例句、不給關鍵詞清單——
            // 給了它會照著造句，也會把清單當成「要避開的詞」在提示裡繞著寫。
            // 這段兩條插圖路共用（搭便車在這裡、獨立插圖副模型在 state_runtime 的 extractScenesStandalone），
            // 所以放在 OS_API.sceneSafeRules 一份，別各寫各的會漂。
            const _safeRules = this.sceneSafeRules(_globalSvc);

            const sysPrompt = _taskInstruction + _safeRules + '\n' + specPrompt;

            const messages = [
                { role: 'system', content: sysPrompt },
                { role: 'user',   content: storyText }
            ];

            let secConfig = {};
            if (win.OS_SETTINGS?.getSecondaryConfig) secConfig = win.OS_SETTINGS.getSecondaryConfig();
            else if (win.OS_SETTINGS?.getConfig)     secConfig = win.OS_SETTINGS.getConfig();
            secConfig._isSecondary = true;
            // 🔌 分流：呼叫端說了這是哪件事（options.task），就照設置裡指定的通道走。
            //    沒指定、或那條通道沒填完 → getConfigFor 自己退回主／副，行為跟以前一樣。
            try {
                if (options && options.task && win.OS_SETTINGS && win.OS_SETTINGS.getConfigFor) {
                    const _routed = win.OS_SETTINGS.getConfigFor(options.task);
                    if (_routed) secConfig = _routed;
                }
            } catch (e) {}

            this.chat(
                messages,
                secConfig,
                null,
                (aiResponse) => {
                    try {
                        // 提取 JSON 陣列（防止 AI 多包了 markdown code fence）
                        const jsonMatch = (aiResponse || '').match(/\[[\s\S]*\]/);
                        if (!jsonMatch) { onFinish(storyText); return; }

                        const insertions = JSON.parse(jsonMatch[0]);
                        if (!Array.isArray(insertions) || insertions.length === 0) {
                            onFinish(storyText); return;
                        }

                        // 原文按行分割，依序找錨點並插入 <scene> block
                        const lines = storyText.split('\n');
                        let offset = 0; // 每次插入後需偏移行索引

                        for (const ins of insertions) {
                            if (!ins.after || !ins.prompt) continue;

                            // 找包含錨點的行（從前往後，取第一個）
                            let targetIdx = -1;
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].includes(ins.after)) { targetIdx = i; break; }
                            }
                            if (targetIdx < 0) {
                                console.warn('[VN SceneGen] 找不到錨點，跳過:', ins.after);
                                continue;
                            }

                            // 在錨點行後插入 <scene>...<\/scene>
                            lines.splice(targetIdx + 1 + offset, 0, '<scene>', ins.prompt, '</scene>');
                            offset += 3;
                        }

                        onFinish(lines.join('\n'));
                    } catch(e) {
                        console.warn('[VN SceneGen] JSON 解析失敗，使用原文:', e);
                        onFinish(storyText);
                    }
                },
                (err) => {
                    console.warn('[VN SceneGen] 副模型分析失敗，跳過插圖:', err);
                    if (onError) onError(err);
                    else onFinish(storyText);
                }
            );
        },

        chatSecondary: async function(messages, onChunk, onFinish, onError, options) {
            let secConfig = {};
            if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getSecondaryConfig === 'function') {
                secConfig = win.OS_SETTINGS.getSecondaryConfig();
            } else if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                secConfig = win.OS_SETTINGS.getConfig();
            }
            secConfig._isSecondary = true;
            // 副模型自訂前置指令（破甲）：在入口統一以 system 插最前 → 不分派發路徑（直連/跟隨/🍎）都生效。
            // 插完就把欄位拿掉，免得 🍎 generateRaw 路徑照 config.customCot 再插一次（雙重注入）。
            try {
                const _secCot = secConfig.customCot;
                if (_secCot && String(_secCot).trim()) {
                    messages = [{ role: 'system', content: String(_secCot) }, ...(messages || [])];
                }
                delete secConfig.customCot;
                delete secConfig.customCotMap;   // 分流到主模型時帶著那張表進來：入口已插過，表留著 chat() 裡會照表再插一次
            } catch (e) {}
            this.chat(messages, secConfig, onChunk, onFinish, onError, options || {});
        },

        // 主模型入口（對稱 chatSecondary）：低頻重品質任務用（如世界書二改，大總結重壓、深度整理）。
        // 這類任務輸出都很長 → 預設開串流（見 chat 的 options.stream；非串流等整篇會撞閘道 ~100s 逾時 504）。
        chatMain: async function(messages, onChunk, onFinish, onError, options) {
            let mainConfig = {};
            if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                mainConfig = Object.assign({}, win.OS_SETTINGS.getConfig());
            }
            mainConfig._isSecondary = false;   // 明確走主模型連線（防 getConfig 回傳被副模型標過的共用物件）
            // 🔌 分流不在這裡做：統一在 chat 開頭照 options.task 換連線（chatSecondary、直接呼叫 chat 的也一樣吃得到）
            // 長輸出任務保底：深度整理/重壓要「整份重印」，連線設定的最大輸出若偏低(如2048)，
            // JSON 會印到一半被掐＝解析失敗整趟白跑。這裡強制下限 8192，不動使用者原設定值本身。
            const _mt = parseInt(mainConfig.maxTokens);
            if (isNaN(_mt) || _mt < 8192) mainConfig.maxTokens = 8192;
            this.chat(messages, mainConfig, onChunk, onFinish, onError, Object.assign({ stream: true }, options || {}));
        },

        chat: async function(messages, config, onChunk, onFinish, onError, options = {}) {
            try { win.AURELIA_USAGE && win.AURELIA_USAGE.bumpText(); } catch (e) {}   // 文字 API 計數（副模型/PWA主模型/總結都走這）
            // 🔌 分流（唯一的一處）：呼叫端用 options.task 說這是哪件事；她在「哪件事走哪個模型」改過這件事，
            //    就把連線那幾欄換成她指定的那條。沒改過就原封不動——呼叫端自己組的設定（副模型沒填退回主模型、
            //    夾 maxTokens、關預設條目…）全部照舊，所以名冊加新的一列不會改到任何既有行為。
            if (options && options.task) {
                try {
                    const _ov = (win.OS_SETTINGS && win.OS_SETTINGS.getRouteOverride) ? win.OS_SETTINGS.getRouteOverride(options.task) : null;
                    if (_ov) {
                        config = Object.assign({}, config, {
                            url: _ov.url, key: _ov.key, model: _ov.model,
                            useSystemApi: _ov.useSystemApi, useGenerateRaw: _ov.useGenerateRaw, stProfileId: _ov.stProfileId,
                            directMode: _ov.directMode, _isSecondary: _ov._isSecondary,
                            // 前置指令跟著連線走：主模型帶主模型那份（含每個連接預設各自那張表）、副模型帶副模型那份；自訂通道不帶。
                            //   以前副模型這裡給空字串，理由是「副模型那份由 chatSecondary 入口自己插」——但經分流走 chat() 進來的
                            //   （應用與組件裡的生成、插圖…）根本沒經過那個入口，一份都沒有。她說：應用組件都沒給自訂前置指令，破不了。
                            customCot: _ov._channel ? '' : (_ov.customCot || ''),
                            customCotMap: _ov._channel ? {} : (_ov.customCotMap || {}),
                            _channel: _ov._channel || undefined, _channelName: _ov._channelName || undefined
                        }, _ov._channel ? { maxTokens: _ov.maxTokens, temperature: _ov.temperature } : {});
                    }
                } catch (e) {}
            } else {
                // 沒帶 task：控制台只能記成「沒有標記的」，也吃不到分流設定。新功能要在 os_settings 的 LLM_TASKS 加一列再帶上 task。
                console.warn('[OS_API] 這一通沒有說是哪件事（options.task），控制台會記成沒有標記：', (config && config.route) || (options && options.label) || '');
            }
            // 呼叫方要「保留三反引號」（創作室生成 JSON 程式碼）→ 跳過 cleanRawOutput 吃圍欄那步，避免 /```/g 被削成 //g。
            const _keepFences = !!options.keepCodeFences;
            const globalUserName = this.getGlobalUserName();
            // 兼容 multimodal：content 可能是字串或 [{type:'text',...},{type:'image_url',...}] 陣列
            messages.forEach(m => {
                if (typeof m.content === 'string') {
                    m.content = m.content.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                } else if (Array.isArray(m.content)) {
                    m.content.forEach(part => {
                        if (part && part.type === 'text' && typeof part.text === 'string') {
                            part.text = part.text.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                        }
                    });
                }
            });

            // ── 🔥 全局 API 記錄：中央 chat 攔「所有」文字呼叫（不論哪個入口、有沒有貼標都記），
            //    按連線分類（main=主模型 / sec=副模型 / aux=未標記的手搭 config）+ 標註用途 route ──
            let _useRec = null, _useInP = null;   // 用量記錄層的那一筆（托管路徑會提早 return，要在外層拿得到）
            let _apiRec = null;                    // 控制台 API 記錄那一筆：前置指令插進去之後要把記錄換成真正送出的那包
            {
                const _cat = (config && config._isSecondary === false) ? 'main'
                           : (config && config._isSecondary === true)  ? 'sec'
                           : 'aux';
                const _rec = _apiLogStart(win.AURELIA_API_LOG, messages);
                _rec.cat = _cat;
                _rec.route = (config && config.route) || (options && options.label) || '';
                _rec.task = (options && options.task) || '';   // 控制台的記錄頁拿它顯示中文的任務名
                _apiRec = _rec;
                _rec.inTok = null; _rec.outTok = null;   // token 估算(非阻塞，算完面板下次刷新即顯示)
                const _inP = _estTok(_msgsText(messages)).then(n => { _rec.inTok = n; _apiLogFire('tok', _rec); return n; }).catch(() => 0);
                _useInP = _inP;
                // 📊 同一筆也交給用量記錄層存進 IndexedDB（環形緩衝關掉就沒了，這份要長期留著算每天用多少）
                _useRec = win.OS_USAGE ? win.OS_USAGE.start({
                    kind: 'text',
                    task: (options && options.task) || '',
                    label: _rec.route,
                    cat: _cat,
                    chan: (config && config._channel) || _cat,
                    chanName: (config && config._channelName) || (_cat === 'main' ? '主模型' : (_cat === 'sec' ? '副模型' : '其他')),
                    model: (config && config.model) || '',
                    via: (config && config.useSystemApi) ? 'st' : 'direct'
                }) : null;
                const _use = _useRec;
                const _of = onFinish, _oe = onError;
                onFinish = (text) => {
                    try {
                        _secLogEnd(_rec, true, text);
                        const _outP = _estTok(text).then(n => { _rec.outTok = n; _apiLogFire('tok', _rec); return n; }).catch(() => 0);
                        if (_use) Promise.all([_inP, _outP]).then(v => win.OS_USAGE.end(_use, { ok: true, inTok: v[0], outTok: v[1], ms: _rec.ms })).catch(() => {});
                    } catch (e) {}
                    if (_of) _of(text);
                };
                onError  = (err)  => {
                    try {
                        _secLogEnd(_rec, false, err);
                        if (_use) _inP.then(n => win.OS_USAGE.end(_use, { ok: false, inTok: n, err: err, ms: _rec.ms })).catch(() => {});
                    } catch (e) {}
                    if (_oe) _oe(err);
                };
            }

            if (this.isStandalone() && config.useSystemApi) {
                config = { ...config, useSystemApi: false };
                if (!config.url || !config.key) {
                    const err = new Error('獨立模式需填入 API URL 與 Key（設置 → 主模型）');
                    console.error('[OS_API]', err.message);
                    if (onError) onError(err);
                    return;
                }
                console.log('[OS_API] 獨立模式：自動切換為直連 API →', config.url);
            }

            const useSystemApi = config.useSystemApi === true;
            const stProfileId = config.stProfileId || ""; 
            const enableStreaming = config.enableStreaming || false;
            let maxTokens = parseInt(config.maxTokens);
            if (isNaN(maxTokens) || maxTokens <= 0) maxTokens = 8192;
            const temperature = isFinite(parseFloat(config.temperature)) ? parseFloat(config.temperature) : 1.0;
            const top_p = isFinite(parseFloat(config.top_p)) ? parseFloat(config.top_p) : undefined;
            // ⚠️ penalty 為 0（預設值）時「不送」：gemini 原生 API 沒有 frequency/presence_penalty 這兩個欄位，
            // 連送 0 都會被 Pioneer/反代的 gemini 路由 404（No endpoints found that can handle the requested parameters）。
            // 非 0 才送（給 GPT/Claude 等支援的模型用），這樣 gemini/claude/gpt 同一套程式碼都能跑。
            const _freqPen = parseFloat(config.frequency_penalty);
            const frequency_penalty = (isFinite(_freqPen) && _freqPen !== 0) ? _freqPen : undefined;
            const _presPen = parseFloat(config.presence_penalty);
            const presence_penalty = (isFinite(_presPen) && _presPen !== 0) ? _presPen : undefined;

            if (!useSystemApi && (!config.url || !config.key)) {
                if (onError) onError(new Error('API 配置不完整 (無 URL/Key)')); return;
            }

            let totalTokens = 0;
            let totalChars = 0;
            try {
                // 兼容陣列 content：抽 text 部分計算 token；圖片不計入文字字數但會在送 API 時算 token
                const fullPromptString = messages.map(m => {
                    if (typeof m.content === 'string') return m.content;
                    if (Array.isArray(m.content)) {
                        return m.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
                    }
                    return '';
                }).join('\n');
                totalChars = fullPromptString.length;
                if (win.SillyTavern && typeof win.SillyTavern.getTokenCountAsync === 'function') {
                    totalTokens = await win.SillyTavern.getTokenCountAsync(fullPromptString);
                } else {
                    totalTokens = Math.ceil(totalChars * 0.5);
                }
            } catch(e) { totalTokens = Math.ceil(totalChars * 0.5) || 0; }

            try {
                const typeLabel = config._isSecondary ? "副模型 (Secondary)" : "主模型 (Primary)";
                console.group(`📊 [OS_API] ${typeLabel} 發送檢查 (Token: ${totalTokens} | Chars: ${totalChars})`);
                let modelDisplay = config.model;
                if (useSystemApi) {
                    if (stProfileId) {
                        const profileInfo = (win.SillyTavern?.getContext?.()?.extensionSettings?.connectionManager?.profiles || [])
                            .find(p => p.id === stProfileId);
                        modelDisplay = profileInfo
                            ? `${profileInfo.model || '?'} [Profile: ${profileInfo.name}]`
                            : `(未知 ProfileId: ${stProfileId})`;
                    } else {
                        try {
                            const stModel = win.SillyTavern?.getContext?.()?.getChatCompletionModel?.();
                            modelDisplay = stModel ? `${stModel} (ST當前激活)` : '(由酒館主系統決定)';
                        } catch(_) { modelDisplay = '(由酒館主系統決定)'; }
                    }
                }
                console.log(`⚙️ 參數: Temp=${temperature}, MaxTokens=${maxTokens}, ProfileId=${stProfileId || '(空-當前激活)'}, Model=${modelDisplay}`);

                const groups = { prompts: [], char: [], lore: [], reality: [], chat: [], persona: [] };

                messages.forEach((msg, index) => {
                    // 兼容陣列 content：preview 抽 text 部分 + 標記圖片數
                    let textContent = '';
                    let imgCount = 0;
                    if (typeof msg.content === 'string') {
                        textContent = msg.content;
                    } else if (Array.isArray(msg.content)) {
                        textContent = msg.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
                        imgCount = msg.content.filter(p => p && p.type === 'image_url').length;
                    }
                    const content = textContent || "";
                    const imgTag = imgCount > 0 ? ` [圖×${imgCount}]` : '';
                    let preview = content.length > 80 ? content.substring(0, 80).replace(/\n/g, ' ') + "..." : content.replace(/\n/g, ' ');
                    preview += imgTag;

                    const item = { "#": index, "Role": msg.role, "預覽": preview, "Length": content.length };
                    
                    if (msg.role === 'system') {
                        if (content.includes('Reality Context')) { item["類型"] = "線下劇情"; groups.reality.push(item); } 
                        else if (content.includes('[World Info:') || (content.includes('World Info') && !content.includes('[Character Persona (Private Chat)]'))) {
                            const matches = content.match(/\[World Info: (.*?)\]/g);
                            item["觸發條目"] = matches ? matches.map(s => s.replace(/\[World Info: |\]/g, '')).join(', ') : "(無)";
                            groups.lore.push(item);
                        }
                        else if (content.includes('[User Info (') || content.includes('[User Persona (')) {
                            item["類型"] = "玩家本人"; groups.char.push(item);
                        }
                        else if (content.includes('[Character Persona (Private Chat)]')) { 
                            item["類型"] = "私聊人設"; 
                            item["來源"] = content.includes('---') ? "混合（自定義+世界書）" : "已設置";
                            groups.persona.push(item); 
                        }
                        else if (content.includes('[Group Note]')) { 
                            item["類型"] = "群聊備註"; 
                            item["來源"] = content.includes('---') ? "混合（自定義+世界書）" : "已設置";
                            groups.persona.push(item); 
                        } 
                        else if (content.includes('Character Info') || content.includes('Scenario')) {
                            item["類型"] = "角色/場景"; groups.char.push(item);
                        }
                        else if (content.includes('Roleplay Instruction') || content.includes('Chain of Thought')) {
                            item["類型"] = "指令/CoT"; groups.prompts.push(item);
                        }
                        else { item["類型"] = "其他"; groups.prompts.push(item); }
                    } else {
                        item["來源"] = msg._source === 'phone' ? "手機" : "輸入";
                        groups.chat.push(item);
                    }
                });

                if(groups.prompts.length) { console.group("📝 核心提示詞"); console.table(groups.prompts); console.groupEnd(); }
                if(groups.char.length) { console.group("👤 角色與用戶"); console.table(groups.char); console.groupEnd(); }
                if(groups.lore.length) { console.group("📖 世界書"); console.table(groups.lore); console.groupEnd(); }
                if(groups.persona.length) { 
                    const privatePersona = groups.persona.filter(p => p["類型"] === "私聊人設");
                    const groupNote = groups.persona.filter(p => p["類型"] === "群聊備註");
                    if (privatePersona.length) { console.group("🎭 私聊人設"); console.table(privatePersona); console.groupEnd(); }
                    if (groupNote.length) { console.group("📝 群聊備註"); console.table(groupNote); console.groupEnd(); }
                }
                if(groups.reality.length) { console.group("🔥 線下劇情"); console.table(groups.reality); console.groupEnd(); }
                if(groups.chat.length) { console.group("💬 對話歷史"); console.table(groups.chat); console.groupEnd(); }

                console.groupEnd(); 
            } catch (e) { console.warn("Debug View Error", e); }

            if (config.usePresetPrompts) {
                try {
                    const th = win.TavernHelper || win.parent?.TavernHelper;
                    if (th && typeof th.getPreset === 'function') {
                        const targetPreset = config.presetName && config.presetName.trim()
                            ? config.presetName.trim()
                            : 'in_use';
                        const preset = th.getPreset(targetPreset);
                        const prompts = preset?.prompts || [];

                        const PLACEHOLDER_IDS = new Set(['world_info_before','world_info_after','persona_description','char_description','char_personality','scenario','dialogue_examples','chat_history','main','nsfw','jailbreak','enhance_definitions']);
                        const injected = prompts
                            .filter(p => !PLACEHOLDER_IDS.has(p.id))
                            .filter(p => p.enabled !== false)
                            .filter(p => p.content && p.content.trim());

                        if (injected.length > 0) {
                            let combined = injected.map(p => p.content.trim()).join('\n\n');
                            combined = combined.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                            messages.unshift({ role: 'system', content: combined });
                            console.log(`📋 [PresetPrompt] 注入 ${injected.length} 個條目 (來源: "${targetPreset}")，共 ${combined.length} 字元`);
                        }
                    } else {
                        console.warn('📋 [PresetPrompt] TavernHelper 不可用，跳過注入');
                    }
                } catch(e) { console.warn('📋 [PresetPrompt] 注入失敗：', e); }
            }

            let cleanMessages = messages
                .map(m => { const { _source, _isProto, _chatId, ...rest } = m; return rest; })
                .filter(m => {
                    // 字串非空 或 陣列非空（含 text/image 任一）
                    if (typeof m.content === 'string') return m.content.trim().length > 0;
                    if (Array.isArray(m.content)) return m.content.length > 0;
                    return false;
                });

            try {
                let stringifiedPayload = JSON.stringify(cleanMessages);
                stringifiedPayload = stringifiedPayload.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                cleanMessages = JSON.parse(stringifiedPayload);
            } catch(e) { console.warn("核彈替換失效", e); }

            let _dbgId    = Date.now() + Math.random();   // 酒館 generateRaw 那條拿它當 generation_id

            try {
                let fullText = "";
                let rawApiResponse = null; 
                const extraParams = {};
                if (top_p !== undefined) extraParams.top_p = top_p;
                if (frequency_penalty !== undefined) extraParams.frequency_penalty = frequency_penalty;
                if (presence_penalty !== undefined) extraParams.presence_penalty = presence_penalty;

                // 主模型的自訂前置指令：直連（自己填網址）與托管這兩條以前從來沒吃到，只有走酒館連線的 🍎 那條才插。
                //   她在 PWA 上填了主模型那格沒作用；副模型是在入口就插，所以一直有。這裡補直連那份，🍎 那條照舊、兩邊互斥不會插兩次。
                //   自訂通道不帶（跟分流那邊一致）；副模型那份 chatSecondary 已經插過。
                //   副模型也插：chatSecondary 入口插過的已把 customCot／customCotMap 拿掉，到這裡是空的不會重複；
                //   經分流直接進 chat() 的副模型設定還帶著那份，就在這裡插。
                if (!useSystemApi && !config._channel) {
                    const _cm = config.customCotMap || {};
                    const _ck = (config.stProfileId && String(config.stProfileId).trim()) ? String(config.stProfileId) : '__none__';
                    const _cc = (_ck in _cm) ? (_cm[_ck] || '') : (config.customCot || '');
                    if (_cc && String(_cc).trim()) cleanMessages = [{ role: 'system', content: String(_cc) }, ...cleanMessages];
                }
                // 整包一則使用者訊息都沒有（應用與組件的生成只給一段 system）：酒館後端送去 Claude／Gemini 之前會自己補一則
                //   使用者訊息「Let's get started.」（src/prompt-converters.js 的 placeholders），直連沒有人補。
                //   只有 system 的請求，有些上游會拒答或回錯，同一份前置指令在酒館能出、在 PWA 直接道歉，這是差別之一。照酒館補同一句。
                if (!useSystemApi && cleanMessages.length && !cleanMessages.some(m => m && m.role === 'user')) {
                    cleanMessages = [...cleanMessages, { role: 'user', content: "Let's get started." }];
                }
                _apiLogRefresh(_apiRec, cleanMessages);   // 控制台記錄換成真正送出的那包（含前置指令）

                const commonBody = {
                    model: config.model, messages: cleanMessages,
                    stream: false, max_tokens: maxTokens, temperature: temperature,
                    ...extraParams
                };


                if (config.enableThinking) {
                    commonBody.include_reasoning = true;
                    const effort = config.reasoningEffort || 'auto';
                    if (effort !== 'auto') commonBody.reasoning_effort = effort;
                    console.log(`💭 [OS_API] 思考鏈已啟用 (effort: ${effort})`);
                } else {
                    commonBody.include_reasoning = false;
                    // ⚠️ 不送 reasoning_effort: 'none'：'none' 是非標準值，gemini(Pioneer/反代)路由會 404；
                    // include_reasoning:false 已足以關閉推理輸出，GPT/Claude 也不受影響。
                }

                // 🛡 Gemini 的安全過濾全關：酒館送去 Google 那條後端每一通都附 safetySettings=BLOCK_NONE（src/endpoints/backends/chat-completions.js 的 GEMINI_SAFETY），
                //   直連走 OpenAI 相容格式從來沒帶 → 站用預設過濾，R18 整段被吃掉，回來是 finish_reason=content_filter、內容空。
                //   她遇到的就是這個：同一個站同一份提示，酒館出、PWA 空。寫法照 Google 相容端點的規格：頂層 extra_body.google.safety_settings。
                //   只在模型名有 gemini 時帶，別的模型不認這個欄位。
                if (/gemini/i.test(String(config.model || ''))) {
                    const _SAFE = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_CIVIC_INTEGRITY']
                        .map(category => ({ category, threshold: 'OFF' }));   // 門檻用 OFF：跟酒館 src/constants.js 的 GEMINI_SAFETY 同一個值（比 BLOCK_NONE 更新更徹底）
                    commonBody.extra_body = Object.assign({}, commonBody.extra_body, { google: Object.assign({}, commonBody.extra_body && commonBody.extra_body.google, { safety_settings: _SAFE }) });
                }

                // 📡 回覆交給伺服器跑：呼叫端給了 relayJob、而且她開了托管 → 把這一包丟過去，手機就可以睡了。
                //    擺在 🍎 與直連兩條路之前：伺服器是原生 HTTP 出去的，本來就沒有 iOS 那個 CORS 問題，
                //    所以只要有 url/key 就走這條。跟著酒館那條沒有 key 可以交給伺服器，不走。
                if (options.relayJob && !useSystemApi && config.url && config.key && win.OS_RELAY && win.OS_RELAY.enabled()) {
                    let _rUrl = String(config.url).replace(/\/$/, '');
                    if (!_rUrl.includes('/chat/completions')) _rUrl += (_rUrl.endsWith('/v1') ? '' : '/v1') + '/chat/completions';
                    try {
                        const _jid = await win.OS_RELAY.submit(Object.assign({}, options.relayJob, {
                            upstream: { url: _rUrl, key: config.key, body: commonBody }
                        }));
                        console.log('📡 [OS_API] 這一輪交給伺服器跑了：' + _jid);
                        // 📊 這一輪的錢是伺服器替她付出去的，帳一樣要記。
                        //    回來的字數不經過這裡（結果由 os_relay 收回直接交給 app），所以只記送出去的。
                        if (_useRec) {
                            try {
                                _useRec.via = 'relay'; _useRec.relay = true;
                                const _ms = Date.now() - _useRec.t;
                                _useInP.then(n => win.OS_USAGE.end(_useRec, { ok: true, inTok: n, outTok: 0, ms: _ms })).catch(() => {});
                            } catch (e) {}
                        }
                        if (options.onQueued) options.onQueued(_jid);
                        return;
                    } catch (e) {
                        console.warn('📡 [OS_API] 交給伺服器失敗，改回手機自己跑：', (e && e.message) || e);
                        if (options.onRelayFail) { try { options.onRelayFail(e); } catch (e2) {} }
                    }
                }

                if (config.useGenerateRaw) {
                    // 🍎 generateRaw 模式（iOS 相容）：走酒館原生生成管線。
                    // ordered_prompts 只送這些訊息 → 排除 preset/角色卡/世界書/歷史（文件：未列入的不會使用）。
                    // 好處：①不直連外部 → 避開 iOS WebView 的 CORS/Load failed；
                    //       ②由酒館前端管線送出 → 套用「排除請求主體參數」(penalty 被剝) → gemini 不 404。
                    // 🍎 iOS 相容（原生、零插件依賴）：不讓 WebView 直連 Pioneer（會被 iOS CORS/Load failed 擋），
                    // 改 POST 到酒館「同源」後端 /api/backends/chat-completions/generate → 後端用原生 HTTP 代打外部 API
                    // （原生無 CORS）。body 只送精簡乾淨欄位（無 penalty / include_reasoning / reasoning_effort）→ gemini 不 404。
                    // 自訂前置指令（破甲 COT）：每個連接預設各記各的(customCotMap[profileId])、舊版單格 customCot 當退路；有設就以 system 角色插在最前面，只影響 🍎 路徑（native /generate 與 generateRaw 退路皆吃到）
                    const _cotMap = config.customCotMap || {};
                    const _cotKey = (config.stProfileId && String(config.stProfileId).trim()) ? String(config.stProfileId) : '__none__';
                    const _cot = (_cotKey in _cotMap) ? (_cotMap[_cotKey] || '') : (config.customCot || '');
                    if (_cot && String(_cot).trim()) {
                        cleanMessages = [{ role: 'system', content: String(_cot) }, ...cleanMessages];
                        _apiLogRefresh(_apiRec, cleanMessages);   // 同上：記錄換成含前置指令的那包
                    }
                    let _ngOk = false;
                    try {
                        const _ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
                        const _src = _ctx && (_ctx.oai_settings && _ctx.oai_settings.chat_completion_source);
                        if (_ctx && config.stProfileId && _ctx.ConnectionManagerRequestService) {
                            // 🍎＋選了 profile：交給酒館 ConnectionManager 用「該 profile 的完整連線」
                            // （來源 api / secret / exclude / region 全照 profile）→ 真的打到 profile 的來源。
                            // 串流＝呼叫端決定（options.stream）：預設關（隔離酒館串流開關，免撞「便宜端點
                            // (如 Pioneer gemini)不支援串流」的 404）；長輸出任務（重壓/深度整理走 chatMain）
                            // 開 true——非串流要等整篇生完才回首位元組，Opus 長輸出會撞閘道 ~100s 逾時 504。
                            // overridePayload 在 ST 合併序最後，蓋過 oai_settings.stream_openai。
                            const _streamOn = options.stream === true;
                            let _ov = _vertexOverride(_ctx, config.stProfileId, { temperature, stream: _streamOn, ...extraParams });
                            _ov = _ensureModelOverride(_ctx, config.stProfileId, _ov, config.model);
                            _ov = _dropZeroTopK(_ctx, _ov);
                            const _response = await _ctx.ConnectionManagerRequestService.sendRequest(
                                config.stProfileId, cleanMessages, maxTokens, { signal: options.signal, stream: _streamOn }, _ov   // 帶 abort signal→停止鈕(創作室等)才停得了；undefined 時 signal=undefined 不影響
                            );
                            if (_streamOn && typeof _response === 'function') {
                                // 串流：generator 每次 yield {text: 累積全文} → 收到最後一筆＝完整輸出
                                let _acc = '';
                                for await (const _chunk of _response()) {
                                    if (_chunk && typeof _chunk.text === 'string') { _acc = _chunk.text; if (onChunk) { try { onChunk(_acc); } catch (e) {} } }
                                }
                                const _t2 = normalizeResponse({ content: _acc }, _keepFences);   // 同非串流路：keepFences 交給它自己判斷
                                if (_t2) { rawApiResponse = { content: _acc }; fullText = _t2; _ngOk = true; }
                                else { console.warn('[OS_API] 🍎 profile 串流無內容回傳'); }
                            } else {
                                const _t = normalizeResponse(_response, _keepFences);
                                if (_t) { rawApiResponse = _response; fullText = _t; _ngOk = true; }
                                else { console.warn('[OS_API] 🍎 profile 路徑無內容回傳', _response); }
                            }
                        } else if (_ctx && _src) {
                            // 🍎＋沒選 profile（或 ConnectionManager 不可用）：精簡乾淨 body 打「ST 當前激活來源」
                            // （避開 gemini penalty 404 / iOS CORS）。跟隨酒館＝型號以酒館當前為準（同跟隨路徑），
                            // 不卡奧瑞亞凍結的 config.model（型號名對不上會 404 No endpoints found）。
                            // 優先序：profile 自帶型號 > 酒館當前型號 > config.model 保底。
                            let _model = '';
                            if (config.stProfileId) {
                                try {
                                    const _profs = (_ctx.extensionSettings && _ctx.extensionSettings.connectionManager && _ctx.extensionSettings.connectionManager.profiles) || [];
                                    const _p = _profs.find(p => p && p.id === config.stProfileId);
                                    if (_p && _p.model) _model = _p.model;
                                } catch (e) {}
                            }
                            if (!_model && typeof _ctx.getChatCompletionModel === 'function') _model = _ctx.getChatCompletionModel();
                            if (!_model) _model = config.model;
                            const _body = {
                                chat_completion_source: _src,
                                model: _model,
                                messages: cleanMessages,
                                temperature: temperature,
                                max_tokens: maxTokens,
                                stream: false
                            };
                            if (top_p !== undefined) _body.top_p = top_p;
                            // 還原 CoT：思考開啟時帶 include_reasoning（讓模型推理情感/規範條目）；不送 'none'，避免 gemini 404
                            if (config.enableThinking) {
                                _body.include_reasoning = true;
                                const _eff = config.reasoningEffort || 'auto';
                                if (_eff !== 'auto') _body.reasoning_effort = _eff;
                            }
                            // vertex 服務帳號：這條「🍎+沒選 profile」走直連 body、不經 ConnectionManager → 也要自己補 vertexai_auth_mode，
                            // 否則後端預設 'express' → 服務帳號(full)被當 API Key 找不到金鑰（Secret id not found for api_key_vertexai）。
                            // 同 _vertexOverride 的修；那邊修的是 sendRequest(選 profile) 兩條，這條無 profile 的直連當時漏補（創作室主模型開🍎+vertex 踩到）。
                            if (/vertex/i.test(_src || '')) {
                                const _oai = (_ctx && _ctx.oai_settings) || win.oai_settings || (win.parent && win.parent.oai_settings) || {};
                                _body.vertexai_auth_mode = _oai.vertexai_auth_mode || 'full';   // 讀不到全域 → 保底服務帳號(full)；express 用戶全域是 'express' 會讀到、不誤觸
                                if (_oai.vertexai_express_project_id) _body.vertexai_express_project_id = _oai.vertexai_express_project_id;
                            }
                            _dropZeroTopK(_ctx, _body);   // 這條直連自己組 body，不經 sendRequest → 同樣要擋掉 top_k=0
                            const _resp = await fetch('/api/backends/chat-completions/generate', {
                                method: 'POST',
                                headers: { ..._ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                                body: _safeJson(_body),
                                signal: options.signal || undefined
                            });
                            const _data = await _resp.json();
                            const _t = normalizeResponse(_data, _keepFences);
                            if (_resp.ok && _t) { rawApiResponse = _data; fullText = _t; _ngOk = true; }
                            else { console.warn('[OS_API] 原生 /generate 未成功，HTTP', _resp.status, _data && _data.error); }
                        }
                    } catch (e) {
                        // 選了 profile 卻失敗：別退 generateRaw（它用「當前激活連線」答、會拿錯模型掩蓋真錯誤）→ 把真錯誤拋出去顯示
                        if (config.stProfileId) throw e;
                        console.warn('[OS_API] 原生 /generate 例外，退回 generateRaw', e);
                    }
                    // 保險：原生那條若失敗，退回 window.generateRaw（僅「沒選 profile」時；選了 profile 不偷換連線）
                    if (!_ngOk && !config.stProfileId) {
                        const _genRaw = win.generateRaw || (win.parent && win.parent.generateRaw)
                            || (win.TavernHelper && win.TavernHelper.generateRaw)
                            || (win.parent && win.parent.TavernHelper && win.parent.TavernHelper.generateRaw);
                        if (typeof _genRaw !== 'function') throw new Error('generateRaw 不可用');
                        const _ordered = cleanMessages.map(m => ({
                            role: m.role || 'user',
                            content: typeof m.content === 'string' ? m.content
                                : (Array.isArray(m.content) ? m.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n') : String(m.content || ''))
                        }));
                        const _raw = await _genRaw({ user_input: ' ', ordered_prompts: _ordered, should_silence: true, max_chat_history: 0, generation_id: 'os_api_' + _dbgId });
                        rawApiResponse = { via: 'generateRaw' };
                        fullText = (typeof cleanRawOutput === 'function') ? cleanRawOutput(String(_raw || ''), _keepFences) : String(_raw || '');
                    }
                } else if (useSystemApi) {
                    const context = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
                    if (!context) throw new Error("無 Context");
                    
                    if (stProfileId) {
                        // 砍掉舊的 UI profile switching dance（之前會把 #connection_profiles select 切過去再切回來）
                        // 原因：並發呼叫會互相 abort 對方的 in-flight fetch，console 噴 "Canceled because main api changed"
                        // ST 的 sendRequest(profileId, ...) 本身就會用對應 profile 的 url/key/model，不需要 UI 同步切
                        // 串流＝呼叫端決定（options.stream），預設關：隔離酒館串流開關（overridePayload 蓋過
                        // oai_settings.stream_openai），酒館開著也不影響奧瑞亞，免撞「便宜端點(如 Pioneer gemini)
                        // 不支援串流」的 404。沒傳 stream 的呼叫端行為與從前完全相同。
                        // 🚨長輸出任務一定要傳 true：非串流是整篇生完才回第一個位元組，反代那條連線就這樣空掛著。
                        //   實測世界檔案要寫七千多 token、跑 250~260 秒,反代 300 秒整掐斷 → 502 upstream request failed
                        //   （時間戳分毫不差的 300 秒＝逾時，不是隨機錯誤）。🍎 那條早就這樣寫了，這條漏掉。
                        const _streamOn = options.stream === true;
                        let _ov = _vertexOverride(context, stProfileId, { temperature, stream: _streamOn, ...extraParams });
                        _ov = _ensureModelOverride(context, stProfileId, _ov, config.model);
                        _ov = _dropZeroTopK(context, _ov);
                        const response = await context.ConnectionManagerRequestService.sendRequest(
                            stProfileId, cleanMessages, maxTokens, { signal: options.signal, stream: _streamOn }, _ov   // 帶 abort signal→停止鈕才停得了
                        );
                        if (_streamOn && typeof response === 'function') {
                            // 串流：generator 每次 yield {text: 累積全文} → 收到最後一筆＝完整輸出（同 🍎 路徑寫法）
                            let _acc = '';
                            for await (const _chunk of response()) {
                                if (_chunk && typeof _chunk.text === 'string') { _acc = _chunk.text; if (onChunk) { try { onChunk(_acc); } catch (e) {} } }
                            }
                            rawApiResponse = { content: _acc };
                            fullText = normalizeResponse({ content: _acc }, _keepFences);
                        } else {
                            rawApiResponse = response;
                            fullText = normalizeResponse(response, _keepFences);
                        }
                    } else {
                        const headers = context.getRequestHeaders();
                        const activeSource = context.oai_settings?.chat_completion_source
                            || win.oai_settings?.chat_completion_source;
                        if (!activeSource) throw new Error("無法讀取酒館當前 API 來源，請先在酒館選好連接");
                        const activeModel = (typeof context.getChatCompletionModel === 'function')
                            ? context.getChatCompletionModel()
                            : undefined;
                        // 跟隨酒館（無 profile）：模型一律以酒館當前選擇為準。UI 寫「模型由酒館決定」、
                        // 奧瑞亞型號欄在跟隨模式下是隱藏凍結的，不能拿來覆蓋——第三方端點型號名各異
                        // （gemini-3.1-pro-preview vs gemini-3.1-pro），凍結舊值會跟酒館實選的對不上 → 供應商 404
                        // No endpoints found。要主/副跑不同型號請改用 profile 或關閉跟隨。
                        // 酒館真的讀不到型號時才退回 config.model 保底。commonBody 已是乾淨 body（penalty 不送）。
                        const requestBody = { ...commonBody, chat_completion_source: activeSource };
                        if (activeModel) requestBody.model = activeModel;
                        const response = await fetch('/api/backends/chat-completions/generate', {
                            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                            body: _safeJson(requestBody),
                            signal: options.signal || undefined
                        });
                        const data = await response.json();
                        rawApiResponse = data; 
                        fullText = normalizeResponse(data, _keepFences);
                    }
                } else {
                    let targetUrl = config.url.replace(/\/$/, '');
                    if (!targetUrl.includes('/chat/completions')) targetUrl += (targetUrl.endsWith('/v1') ? '' : '/v1') + '/chat/completions';


                    // ── 真實 SSE 串流路徑 ──────────────────────────────────────
                    // 只有呼叫方明確傳入 options.useRealStream:true 才啟用
                    // 其他所有面板繼續走非串流路線，完全不受影響
                    if (options.useRealStream) {
                        const streamBody = { ...commonBody, stream: true };
                        const streamResp = await fetch(targetUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                            body: _safeJson(streamBody),
                            signal: options.signal || undefined
                        });
                        if (!streamResp.ok) throw new Error(`SSE 請求失敗 HTTP ${streamResp.status}`);
                        if (!streamResp.body) throw new Error('此瀏覽器不支援 ReadableStream，請改用 Chrome/Safari');

                        const reader = streamResp.body.getReader();
                        const decoder = new TextDecoder();
                        let buf = '', acc = '';

                        outer: while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            const lines = buf.split('\n');
                            buf = lines.pop() ?? '';   // 保留不完整的末尾行
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed.startsWith('data: ')) continue;
                                const payload = trimmed.slice(6);
                                if (payload === '[DONE]') break outer;
                                try {
                                    const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content || '';
                                    if (delta) { acc += delta; if (onChunk) onChunk(acc); }
                                } catch(e) { /* 忽略格式有誤的行 */ }
                            }
                        }

                        fullText = cleanRawOutput(acc, _keepFences);
                        win.OS_API._lastCtx = {
                            sendTokens: totalTokens, sendChars: totalChars,
                            recvChars: acc.length, recvTokens: Math.ceil(acc.length * 0.5),
                            msgCount: cleanMessages.length, updatedAt: Date.now()
                        };
                        if (onFinish) onFinish(fullText);
                        return;   // ← 提前返回，跳過下方的非串流邏輯
                    }
                    // ── 一般非串流路徑（原邏輯，其他面板走這裡）─────────────

                    const response = await fetch(targetUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                        body: _safeJson(commonBody),
                        signal: options.signal || undefined
                    });
                    const data = await response.json();
                    rawApiResponse = data;
                    fullText = normalizeResponse(data, _keepFences);
                }

                if (!fullText) {
                    // 把上游給的線索帶出來：finish_reason 跟用量。用量全零＝對方根本沒跑模型
                    // （公益站額度用完、被擋），跟「模型跑了但輸出被過濾」是兩回事，錯誤訊息要分得出來。
                    let _why = '';
                    try {
                        const _r = rawApiResponse || {};
                        const _fr = _r.choices?.[0]?.finish_reason || _r.candidates?.[0]?.finishReason || '';
                        const _u = _r.usage || _r.usageMetadata || null;
                        const _pt = _u ? (_u.prompt_tokens ?? _u.promptTokenCount) : undefined;
                        if (_fr) _why += 'finish_reason=' + _fr;
                        if (_pt !== undefined) _why += (_why ? '，' : '') + 'prompt_tokens=' + _pt;
                        if (_pt === 0) _why += '（用量為零，上游沒有真的跑模型：多半是額度用完或被站方擋下）';
                        else if (/safety|prohibited|recitation|blocklist/i.test(_fr)) _why += '（內容被上游安全過濾）';
                    } catch (e) {}
                    throw new Error('API 返回內容為空' + (_why ? '：' + _why : '（可能被過濾或生成失敗）'));
                }


                const recvChars = fullText.length;
                const recvTokens = Math.ceil(recvChars * 0.5);
                win.OS_API._lastCtx = {
                    sendTokens: typeof totalTokens === 'number' ? totalTokens : 0,
                    sendChars:  totalChars,
                    recvTokens: recvTokens,
                    recvChars:  recvChars,
                    msgCount:   cleanMessages.length,
                    updatedAt:  Date.now()
                };

                console.log("🧹 [OS_API] 最終清洗文本:", fullText.substring(0, 100).replace(/\n/g, ' ') + "...");

                if (onFinish) onFinish(fullText);
            } catch (err) {
                console.error("[OS_API Error]", err);
                // 🚨酒館的 ConnectionManager 出錯時一律包成 `API request failed`，真正的原因(金鑰桶不對、
                //   型號不存在、HTTP 狀態…)藏在 error.cause 裡。她沒有 console → 訊息要自己攤開，
                //   不然畫面上永遠只有那句沒有資訊量的話。
                const _flat = _causeText(err);
                if (_flat && err && _flat !== err.message) { try { err.message = _flat; } catch (e) {} }
                if (onError) onError(err);
            }
        },

        // 🎯 排在整包 messages 最後面的那一段：她剛傳、他還沒回的那幾則。
        //   為什麼要另外開一支、不寫在 buildContext 裡：buildContext 回來之後，呼叫端還會再接上
        //   待處理紅包、連結內容、表情包清單、這輪要給它看的照片 —— 以前她的話就被埋在那堆後面，
        //   模型讀到的最後一段是表情包清單。這支由呼叫端在「全部都接完、要送出之前」最後叫一次，
        //   她剛說的話就永遠是模型看到的最後一段。
        //   來源跟 buildContext 同一份（WX_DB 存檔 ＋ 同一個 recentWindow 窗口），所以兩邊切點一定一致。
        wxPendingTurn: async function (chatId, userName, opts) {
            try {
                const id = chatId || (win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID);
                if (!id || !win.WX_DB || typeof win.WX_DB.getApiChat !== 'function') return [];
                const apiChat = await win.WX_DB.getApiChat(id);
                if (!apiChat || !apiChat.messages || !apiChat.messages.length) return [];
                const hist = (win.WX_SUMMARY && win.WX_SUMMARY.recentWindow)
                    ? win.WX_SUMMARY.recentWindow(apiChat) : apiChat.messages;
                let stNow = null;
                try { const S = win.OS_MC_STATUS; if (S && S.load) { const st = await S.load(); stNow = (st && st.date) || null; } } catch (e) {}
                const name = userName || this.getGlobalUserName();
                const _sp = _wxPendingSplit(hist);
                return _wxPendingMessages(_sp.pending, apiChat, name, stNow, opts && opts.lead, hist[_sp.pastEnd]);
            } catch (e) { console.warn('[OS_API] 這一輪要回哪幾則：組裝失敗（不影響送出）', e); return []; }
        },

        buildContext: async function(userMessage, promptKey = 'wx_chat_system') {
            console.log(`[OS_API.buildContext] 目標路由: ${promptKey} | 模式: ${this.isStandalone() ? '獨立' : 'ST'}`);

            if (this.isStandalone()) {
                return this._buildStandaloneContext(userMessage, promptKey);
            }

            let ctx = { char: {}, user: {}, lore: "", history: [] };
            if (win.OS_TAVERN_BRIDGE && typeof win.OS_TAVERN_BRIDGE.getApiContext === 'function') {
                try { ctx = await win.OS_TAVERN_BRIDGE.getApiContext(); } catch (e) { console.error(e); }
            }
            // 🧳 這間被隔離就把「這本」的東西拿掉（他們倆自己的對話記錄在後面，不受影響）
            const _iso = _wxIsolate(promptKey);
            if (_iso.lore) { ctx.lore = ''; console.log('[OS_API] 這間隔離：不吃當前世界書'); }
            if (_iso.story) { ctx.history = []; console.log('[OS_API] 這間隔離：不吃當前劇情'); }

            let userName = this.getGlobalUserName(); 
            let userDesc = "";

            const userModule = win.OS_USER || win.WX_USER;
            if (userModule && typeof userModule.getInfo === 'function') {
                const uInfo = userModule.getInfo();
                if (uInfo.desc) userDesc = uInfo.desc;
            }
            let charName = ctx.char.name || "AI";
            let _wxIsGroup = null;   // 這一間是不是群：分私聊／群聊的提示詞包靠它挑；不知道就 null＝都給
            // {{char}} 用「實際在聊的那個聯絡人」名字（群像卡尤其重要：一張卡很多角色，聯絡人靠世界書條目設人設）
            try {
                const _activeId = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
                if (_activeId && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
                    const _ac = await win.WX_DB.getApiChat(_activeId);
                    if (_ac) _wxIsGroup = !!_ac.isGroup;
                    if (_ac && !_ac.isGroup && _ac.name) charName = _ac.name;
                }
            } catch (e) {}

            let sysPrompt = "";
            let cotPrompt = "";

            const NO_COT_ROUTES = ['iris_chat', 'cheshire_chat'];   // 📞 通話「保留」CoT：AI 靠它讀世界書情感/規範條目想怎麼回；思考關進 <thinking> 由字幕端剝掉

            if (win.OS_PROMPTS) {
                if (promptKey) sysPrompt = win.OS_PROMPTS.get(promptKey, { wxGroup: _wxIsGroup });
                if (!NO_COT_ROUTES.includes(promptKey)) cotPrompt = win.OS_PROMPTS.get('universal_cot');
            }

            // 🔑 解析巨集：模板裡的 {{char}}/{{user}} 走直連 API「不會」被酒館替換 → 自己換成真名。
            //    否則 AI 拿到字面「{{user}}」只能亂猜，加上劇情歷史滿是 MC（${userName}）→ 把使用者當成別的角色。
            const _resolveMacros = (s) => String(s == null ? '' : s).split('{{char}}').join(charName).split('{{user}}').join(userName);
            sysPrompt = _resolveMacros(sysPrompt);
            cotPrompt = _resolveMacros(cotPrompt);

            if (!sysPrompt && promptKey === 'wx_chat_system') {
                sysPrompt = `You are ${charName}. Chat with ${userName}.`;
            }

            const apiMessages = [];

            if (cotPrompt) apiMessages.push({ role: "system", content: `### \n${cotPrompt}` });
            if (sysPrompt) apiMessages.push({ role: "system", content: `### Instruction\n${sysPrompt}` });

            let contextBlock = "";
            // 🚫 大廳(iris/cheshire)完全自足：不吃「當前正在玩的卡」的 persona/角色卡/世界書，避免跨卡污染
            //    （否則你在玩東京現代卡時，古風大廳 NPC 會吃到「MC 住東京」）。訪客身分/人設/世界觀由 buildNpcPrompt·buildSysPrompt 自己給。
            const NO_CARD_ROUTES = ['iris_chat', 'cheshire_chat'];
            if (!NO_CARD_ROUTES.includes(promptKey)) {
                if (userDesc || userName !== "User") contextBlock += `[User Persona — ${userName}]:\n${userDesc || '(玩家本人)'}\n⚠️ ${userName} 就是正在跟你聊天的真實使用者本人；你回覆與稱呼的對象永遠是 ${userName}，絕對不要把他當成劇情裡的其他角色或 NPC。\n\n`;
                // 微信暱稱：微信裡別人看到的是暱稱，不是人設真名。
                //   兩個不一樣的時候要講清楚是同一個人，不然 AI 會把 [暱稱] 當成劇情裡另一個角色。
                if (promptKey === 'wx_chat_system') {
                    const _nk = _wxNickNote(userName);   // 共用（獨立版同一支）
                    if (_nk) contextBlock += _nk + '\n\n';
                }
                if (ctx.char.description) contextBlock += `[Character Description]:\n${ctx.char.description}\n\n`;
                if (ctx.char.personality) contextBlock += `[Personality]:\n${ctx.char.personality}\n\n`;
                if (ctx.char.scenario) contextBlock += `[Scenario]:\n${ctx.char.scenario}\n\n`;
                if (ctx.lore) contextBlock += `[World Info]:\n${ctx.lore}\n\n`;
            }
            
            if (contextBlock) {
                apiMessages.push({ role: "system", content: contextBlock });
            }

            // 劇情長期記憶：APP 走 OS_API.chat、不發 GENERATION_STARTED → 吃不到 os_summary_inject 的自動注入；
            //   總結後舊樓又被自動隱藏(橋接 getApiContext 濾掉隱藏)→ 對被總結的舊劇情整段失憶。
            //   這裡補上酒館大總結壓縮版(getCurrentInjectionPayload，與正文同一份輕量版)，讓 APP 也共享長期記憶。
            //   ⚠️ 只給「劇情類 APP」路由：工具型呼叫(煉丹 general_assistant、UI 生成…)不該背劇情總結。關閉：localStorage sp_app_inject_summary='0'。
            const _SUMMARY_ROUTES = new Set(['wx_chat_system', 'call_voice_system', 'wb_world_gen', 'wb_world_continue']);   // 大廳(iris/cheshire)移除：NPC 靠自己的一對一記憶，不吃當前卡大總結(跨卡污染)
            try {
                if (!_iso.story && _SUMMARY_ROUTES.has(promptKey) && localStorage.getItem('sp_app_inject_summary') !== '0' && win.OS_STORY_TOOLS?.getCurrentInjectionPayload) {
                    const _sum = await win.OS_STORY_TOOLS.getCurrentInjectionPayload();
                    if (_sum && _sum.trim()) {
                        apiMessages.push({ role: "system", content: `[劇情總結 — 至今為止的劇情長期記憶，延續勿矛盾]\n${_sum}` });
                        console.log(`[OS_API.buildContext] 注入大總結壓縮版 ${_sum.length} 字 (route: ${promptKey})`);
                    }
                }
            } catch (e) { console.warn('[OS_API.buildContext] 大總結注入失敗:', e); }

            // 🖼 換頭像（權限關著就一個字都不提）、約定、改名改簽名、它記得我頭像的樣子（共用 _wxAbilityBlocks，獨立版同一支）
            if (promptKey === 'wx_chat_system') {
                _wxAbilityBlocks((win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID) || '').forEach(m => apiMessages.push(m));
            }

            if ((promptKey === 'wx_chat_system' || promptKey === 'call_voice_system') && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
                try {
                    const currentChatId = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
                    if (currentChatId) {
                        const apiChat = await win.WX_DB.getApiChat(currentChatId);
                        if (apiChat && !apiChat.isGroup) {
                            let personaText = '';
                            if (apiChat.personaFromLorebook && win.TavernHelper) {
                                try {
                                    // 📚 條目是從哪一本挑的就回哪一本讀（她可以指到別的故事那本）；沒記過才用這張卡的主世界書
                                    const currentLorebook = apiChat.personaLoreBook || win.TavernHelper.getCurrentCharPrimaryLorebook();
                                    if (currentLorebook) {
                                        const entries = await win.TavernHelper.getLorebookEntries(currentLorebook);
                                        const selectedEntry = entries.find(e => e.uid === apiChat.personaFromLorebook);
                                        if (selectedEntry && selectedEntry.content) personaText = selectedEntry.content;
                                    }
                                } catch (e) {}
                            }
                            if (!personaText && apiChat.personaCustom) personaText = apiChat.personaCustom;
                            if (apiChat.personaCustom && apiChat.personaFromLorebook) personaText = `${apiChat.personaCustom}\n\n---\n\n${personaText}`;
                            
                            if (personaText) apiMessages.push({ role: "system", content: `[Character Persona (Private Chat)]:\n${personaText}\n\n` });
                            // 📒 你們的記事本：每輪只給目錄（見 wx_notebook.js brief）；通話只給目錄、不教怎麼寫
                            try {
                                const _nb = win.WX_NOTEBOOK;
                                if (_nb && _nb.brief) {
                                    const _nbt = await _nb.brief(currentChatId, { call: promptKey === 'call_voice_system' });
                                    if (_nbt) apiMessages.push({ role: "system", content: _nbt });
                                }
                            } catch (e) { console.warn('[OS_API] 記事本目錄組裝失敗（不影響送出）', e); }
                            // 🫂 朋友圈：它看得到的最近幾則＋怎麼發文按讚留言（見 wx_moments.js brief）；通話不給
                            if (promptKey !== 'call_voice_system') {
                                try {
                                    const _mo = win.WX_MOMENTS;
                                    if (_mo && _mo.brief) {
                                        const _mot = await _mo.brief(currentChatId);
                                        if (_mot) apiMessages.push({ role: "system", content: _mot });
                                    }
                                } catch (e) { console.warn('[OS_API] 朋友圈組裝失敗（不影響送出）', e); }
                            }
                        } else if (apiChat && apiChat.isGroup) {
                            let groupNoteText = '';
                            if (apiChat.groupNoteFromLorebook && win.TavernHelper) {
                                try {
                                    const currentLorebook = win.TavernHelper.getCurrentCharPrimaryLorebook();
                                    if (currentLorebook) {
                                        const entries = await win.TavernHelper.getLorebookEntries(currentLorebook);
                                        const selectedEntry = entries.find(e => e.uid === apiChat.groupNoteFromLorebook);
                                        if (selectedEntry && selectedEntry.content) groupNoteText = selectedEntry.content;
                                    }
                                } catch (e) {}
                            }
                            if (!groupNoteText && apiChat.groupNoteCustom) groupNoteText = apiChat.groupNoteCustom;
                            if (apiChat.groupNoteCustom && apiChat.groupNoteFromLorebook) groupNoteText = `${apiChat.groupNoteCustom}\n\n---\n\n${groupNoteText}`;
                            
                            if (groupNoteText) apiMessages.push({ role: "system", content: `[Group Note]:\n${groupNoteText}\n\n` });
                        }
                        if (promptKey === 'wx_chat_system') {
                            const _stk = _wxStickerLibBlock(apiChat);   // 共用（獨立版同一支）
                            if (_stk) apiMessages.push({ role: "system", content: _stk });
                        }
                    }
                } catch (e) { console.warn('讀取聊天設置失敗:', e); }
            }

            const NO_HISTORY_ROUTES = ['iris_chat', 'cheshire_chat', 'general_assistant'];   // general_assistant=煉丹/規則/卡片匯入/qb 等工具型生成→不需劇情歷史(角色卡+世界書仍保留給主題化)
            // 大廳可選：打開「大廳 NPC 看你當前劇情」→ 讓 iris/cheshire 破例吃當前卡劇情歷史(跨書吐槽的趣味;預設關)
            const _lobbySeeStory = (promptKey === 'iris_chat' || promptKey === 'cheshire_chat') && localStorage.getItem('lobby_npc_see_current_story') === '1';
            if ((!NO_HISTORY_ROUTES.includes(promptKey) || _lobbySeeStory) && ctx.history && ctx.history.length > 0) {
                let realityText = "### Reality Context (Story History)\nThis is the background story. Use this ONLY for context. DO NOT reply to the story directly. Stick to the APP FORMAT.\n\n";
                ctx.history.forEach(m => {
                    const isUser = m.is_user || m.isMe;
                    const speaker = isUser ? userName : charName;
                    const text = stripVnTags(m.message || m.mes || m.content || "");
                    if (text) realityText += `[${speaker}]: ${text}\n`;
                });
                apiMessages.push({ role: "system", content: realityText });
            }

            // 🧭 AVS 當背景給手機聊天與通話用（唯讀）。
            //   為什麼要：正文有寫「剛吃完牛肉麵、手上拿著誰的衣服」，但「這個角色現在對主角是什麼態度」
            //   是數值、不會寫在正文裡——沒有它，模型只能靠上下文猜語氣，同一個人一下熱情一下冷淡。
            //   為什麼整包：實測整包 1599 字（角色狀態 1359／劇情目標 89／當前場景 63／持有物品 41／暗流 2），
            //   相對於這條路一次送三萬字只佔 5%，切開反而容易切錯人。角色狀態哪天長大了再說。
            //   🚨唯讀：這裡只給它看，不要求回報，也明令不准把數字或欄位名寫進訊息——
            //   一寫出來就是原始格式跑到畫面上。
            if (promptKey === 'wx_chat_system' || promptKey === 'call_voice_system') {
                const _avsBg = _wxAvsBackground();   // 共用（獨立版同一支），說明見那支
                if (_avsBg) {
                    apiMessages.push({ role: 'system', content: _avsBg });
                    console.log('[OS_API.buildContext] 附上 AVS 背景 ' + _avsBg.length + ' 字');
                }
            }

            if ((promptKey === 'wx_chat_system' || promptKey === 'call_voice_system') && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
                 try {
                    const currentChatId = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
                    if (currentChatId) {
                        const apiChat = await win.WX_DB.getApiChat(currentChatId);
                        // 🧭 這一間是誰、還能傳到哪幾間：以前在這裡（歷史最前面）講，現在搬到整包最後面，見 _wxRoomsNoteLate
                        if (apiChat && apiChat.messages) {
                            // 🚨 分隔（通話開始／結束／未接聽）不是誰講的話。以前它們被當成 assistant，
                            //    模型會讀到自己說「通話開始 · 9/10」；更糟的是整串歷史完全沒有時間標記，
                            //    它把上一通當成剛剛才發生 —— 前天借了車、途中就還了，隔兩天再打去，
                            //    它還在接著問那台車要不要再去別家吃晚飯。
                            //    這裡把分隔轉成 system 旁註（不是對話，模型也不會模仿成輸出格式），
                            //    並且用故事時鐘標出那通是哪一天、距今幾天。拿不到故事日期就只寫「之前」。
                            let _stNow = null;
                            try { const S = win.OS_MC_STATUS; if (S && S.load) { const _st = await S.load(); _stNow = (_st && _st.date) || null; } } catch (e) {}
                            const _noteOf = (msg) => _wxSysNote(msg, _stNow);   // 共用（獨立版同一支），寫法見那支
                            // 📒 聊天室長期記憶：早前的訊息壓成一段摘要先注入，原文只帶最近幾則。
                            //    以前這裡是整串 apiChat.messages 全帶——一則都沒切，聊久了又貴又慢，
                            //    真正要緊的事會被埋在幾百則寒暄裡。（可調的「每群聊消息數」管的是關聯群聊，不是這裡。）
                            //    🚨 切窗口一律走 WX_SUMMARY.recentWindow：它只認「最後 N 則」、不吃已摘要指標，
                            //    所以使用者從中間刪過訊息也不可能把「還沒摘要過的」一起跳掉。
                            try {
                                const _sumTxt = win.WX_SUMMARY?.injectionText?.(apiChat);
                                if (_sumTxt) {
                                    apiMessages.push({ role: 'system', content: _sumTxt });
                                    console.log('[OS_API.buildContext] 附上聊天室長期記憶 ' + _sumTxt.length + ' 字');
                                }
                            } catch (e) { console.warn('[OS_API.buildContext] 聊天室記憶注入失敗（不影響送出）:', e); }
                            let _histMsgs = (win.WX_SUMMARY && win.WX_SUMMARY.recentWindow)
                                ? win.WX_SUMMARY.recentWindow(apiChat) : apiChat.messages;
                            // 🎯 她剛傳、他還沒回的那幾則從歷史裡拿出來，由呼叫端排在整包最後面
                            //    （見 _wxPendingSplit／OS_API.wxPendingTurn）。歷史到此為止＝全都是他回過的。
                            //    通話不切：電話是即時的，有自己的「這一通從這裡開始」分隔。
                            if (promptKey === 'wx_chat_system') {
                                const _sp = _wxPendingSplit(_histMsgs);
                                if (_sp.pending.length) _histMsgs = _histMsgs.slice(0, _sp.pastEnd + 1);
                            }
                            const _tAware = _wxTimeAware(apiChat);   // ⏰ 這一間有沒有開時間感知（聊天設置）
                            const rawPhoneMsgs = [];
                            // 📞 這一通已經接通：「以上是以前」那句放在這一通開始的地方，不是放在最後
                            const _curCallAt = (promptKey === 'call_voice_system') ? _openCallAt(_histMsgs, apiChat.messages) : -1;
                            _histMsgs.forEach((msg, _i) => {
                                if (_i === _curCallAt) {
                                    rawPhoneMsgs.push({ role: 'system', content: _CALL_NOW_NOTE, _source: 'phone' });
                                    if (msg && msg._callStart) return;   // 這一通的「通話開始」就是上面那句，不再寫成「之前的一通電話」
                                }
                                if (!msg) return;
                                // 🚫 對方把她刪了之後她還在打的那幾則：他根本沒收到，不能給他看（連「被對方拒收」那句也是）
                                //    她拉黑他時打的：還在黑名單就不帶，放出來之後帶上並寫旁註（共用 _wxBlockSkip／_wxMeBlockNote）
                                if (_wxBlockSkip(msg, apiChat)) return;
                                { const _bn = _wxMeBlockNote(msg, _histMsgs[_i - 1], userName); if (_bn) rawPhoneMsgs.push({ role: 'system', content: _bn, _source: 'phone' }); }
                                // ⏰ 畫面上的時間分隔是 AI 自己寫的 [Time]，不是誰講的話。以前它掉進下面那格，
                                //    變成「對方說了『下午3:20』」，模型就靠這些自己算出隔了多久（她實測被角色說「等一個多小時」）。
                                if (msg.type === 'time') {
                                    if (_tAware) { const _t = String(msg.content || '').trim(); if (_t) rawPhoneMsgs.push({ role: 'system', _source: 'phone', content: '（' + _t + '）' }); }
                                    return;
                                }
                                // ⏰ 隔得夠久標一句（只在這一間開了時間感知時）
                                if (_tAware) { const _g = _wxGapNote(_histMsgs[_i - 1], msg); if (_g) rawPhoneMsgs.push({ role: 'system', _source: 'phone', content: _g }); }
                                if (msg.type === 'system') {
                                    const _note = _noteOf(msg);
                                    if (_note) rawPhoneMsgs.push({ role: 'system', content: _note, _source: 'phone' });
                                    return;
                                }
                                // ↩ 撤回的：寫成旁註（看過沒看過見 _recallNote），不當成誰講的話
                                if (msg.recalled) {
                                    const _rn = _recallNote(msg, _histMsgs, _i, userName);
                                    if (_rn) rawPhoneMsgs.push({ role: 'system', content: _rn, _source: 'phone' });
                                    return;
                                }
                                // 📞 通話餵乾淨口語(content)，不帶 [Chat:|With:][名] 標頭的 raw → 免 AI 學歷史去用聊天格式
                                let _hc = (promptKey === 'call_voice_system') ? (msg.content || "") : _wxStripHeads(msg.raw || msg.content || "");
                                // 📷 她從相簿傳的照片在訊息裡只是圖庫編號 → 換成它看過寫下的那句（沒看過就只說是照片）
                                try { const _pt = win.wxApp && win.wxApp.photoContextText; if (_pt) _hc = _pt(msg, _hc); } catch (e) {}
                                // 🧾 紅包／轉帳／禮物的單號不給它看：看得到就會照抄，抄到同一個號碼兩張卡會黏在一起
                                try { const _sc = win.wxApp && win.wxApp.stripCardIds; if (_sc) _hc = _sc(_hc); } catch (e) {}
                                rawPhoneMsgs.push({
                                    role: msg.isMe ? 'user' : 'assistant',
                                    content: _hc,
                                    _source: 'phone',
                                    _chatKey: currentChatId   // 同一間連續幾則合成一段（標頭拿掉了，不能再靠 [Chat:] 認）
                                });
                            });
                            const mergedPhoneMsgs = smartMergeMessages(rawPhoneMsgs);
                            mergedPhoneMsgs.forEach(msg => {
                                let content = sanitizeContent(msg.content);
                                if (content) apiMessages.push({ role: msg.role, content: content });
                            });
                            // 收尾：講清楚上面全是過去的事，這一通／這一則是新的
                            //    這一通已經接通的話，那句已經放在這一通開始的地方了，這裡不再補
                            if (rawPhoneMsgs.length && _curCallAt < 0) {
                                apiMessages.push({ role: 'system', content: (promptKey === 'call_voice_system')
                                    ? (_tAware ? _CALL_PAST_NOTE : _CALL_PAST_NOTE_NOTIME)
                                    : _wxPastNote(_tAware) });
                            }
                        }
                        
                        // 🔗 記憶關聯：私聊勾了群聊、群聊勾了私聊，帶那幾間最近的訊息（同獨立版，共用 _wxLinkedMemory）
                        try {
                            const _lmTxt = await _wxLinkedMemory(apiChat, userName, (id) => win.WX_DB.getApiChat(id));
                            if (_lmTxt) apiMessages.push({ role: 'system', content: _lmTxt });
                        } catch (e) { console.warn('[OS_API.buildContext] 記憶關聯注入失敗（不影響送出）:', e); }
                    }
                } catch (e) { console.error("Chat history load error", e); }
            }

            try {
                // 🚫 大廳(iris/cheshire)自足：不吃「當前正在玩的卡」的 AVS 狀態變數，避免跨卡污染（與獨立模式守衛一致）
                const avsState = _avsRead();
                if (!NO_CARD_ROUTES.includes(promptKey) && Object.keys(avsState).length > 0) {
                    apiMessages.push({ role: "system", content: `[SYSTEM: Current Dynamic Variables (AVS)]\n${JSON.stringify(avsState)}` });
                }
            } catch(e) {}

            // 🧭 這一間是誰、還能傳到哪幾間 → 貼在整包最後面（她剛說的那幾則之前）。
            //    以前放在歷史最前面：中間隔著世界書、記憶、幾十則歷史，代號早被各種背景裡的同類編號沖掉，
            //    模型抄別的。她要它黏在最底部、離要寫的地方最近，世界背景才擾亂不到。
            await _wxRoomsNoteLate(apiMessages, promptKey);
            if (userMessage) {
                let finalUserMsg = userMessage;
                if (promptKey.includes('wb_')) {
                    finalUserMsg += `\n\n[SYSTEM FORCE COMMAND]\nOutput the defined TAGS ONLY. No conversational filler. No "Here is the post". No markdown code blocks.\nStart immediately with [wb_post] or [wb_reply].`;
                } else if (promptKey === 'wx_chat_system') {
                    // 是哪一間已經在前面講過（_wxRoomsNote），這裡不再每則接 [Chat:]/[With:] 標頭——模型看到就會每句照抄
                    const _inRoom = !!(win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID);
                    finalUserMsg = _inRoom ? `[${userName}] ${userMessage}` : userMessage;
                }
                apiMessages.push({ role: "user", content: finalUserMsg });
            }

            return apiMessages;
        },

        // --- 4.5 獨立模式：劇情正文當背景（酒館那條路的 ### Reality Context 對應物）---
        //   資料源是 OS_DB 章節（by storyId），不是聊天樓；保留幾章全文走全系統唯一那格 ctxChapters
        //   （N＝最近 N 章全文、0＝全部只讀摘要、null＝全送），更舊的縮成摘要，跟劇情面板同一套。
        // 應用與組件叫模型時，任務指令前面接的背景。酒館版 app_runtime 自己從酒館拿（角色卡、最近二十則、角色世界書、大總結）；
        //   PWA 沒有酒館，以前一個字都沒接 → 模型只看到「前置指令＋一段任務」，同一份提示、同一個模型在酒館能出、在 PWA 直接道歉。
        //   這裡照酒館那份的四塊，從 PWA 自己的來源拿：人設、世界書（同樣截 4000）、大總結、最近劇情（跟劇情面板同一套截法）。
        //   酒館裡回空字串，app_runtime 那邊自己拿的不動。
        appContextBlock: async function () {
            if (!this.isStandalone()) return '';
            let ctx = '';
            try {
                const p = (win.OS_PERSONA && win.OS_PERSONA.getCurrent) ? (win.OS_PERSONA.getCurrent() || {}) : {};
                const n = String(p.name || '').trim(), d = String(p.description || p.desc || '').trim();
                if (n || d) ctx += '【主角】' + n + '\n' + d + '\n\n';
            } catch (e) {}
            try {
                if (win.OS_WORLDBOOK && win.OS_WORLDBOOK.getEnabledContext) {
                    let lore = String((await win.OS_WORLDBOOK.getEnabledContext('')) || '');
                    if (lore.length > 4000) lore = lore.slice(0, 4000);
                    if (lore.trim()) ctx += '【世界設定】\n' + lore + '\n\n';
                }
            } catch (e) {}
            try {
                if (win.OS_STORY_TOOLS && win.OS_STORY_TOOLS.getCurrentInjectionPayload && localStorage.getItem('sp_app_inject_summary') !== '0') {
                    const sm = await win.OS_STORY_TOOLS.getCurrentInjectionPayload();
                    if (sm && String(sm).trim()) ctx += '【劇情總結(至今為止的長期記憶，延續勿矛盾)】\n' + String(sm).trim() + '\n\n';
                }
            } catch (e) {}
            try {
                const st = await this._buildStoryReality(this.getGlobalUserName());
                if (st && String(st).trim()) ctx += '【最近劇情】\n' + String(st).trim() + '\n\n';
            } catch (e) {}
            return ctx;
        },
        _buildStoryReality: async function(userName) {
            if (!win.OS_DB?.getAllVnChapters) return '';
            const _sid = (win.OS_AVS_ADAPTER?.getStoryId?.()) || localStorage.getItem('vn_current_story_id') || '';
            const _all = await win.OS_DB.getAllVnChapters();
            const _ch = (_sid ? _all.filter(c => c.storyId === _sid) : _all.filter(c => !c.storyId)).reverse();   // 舊→新
            if (!_ch.length) return '';

            const _keepN = win.OS_APP_CTX_MSGS ? win.OS_APP_CTX_MSGS() : 5;
            const _lines = [];
            _ch.forEach((c, idx) => {
                let _t = String(c.content || '');
                if (!_t) return;
                _t = _t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // 先剝 CoT：思考區提到 <content> 會從 CoT 開抓
                const _recent = (_keepN === null) || (idx >= _ch.length - _keepN);
                if (!_recent) {
                    // 摘要標記可能被改成別家 preset 的 → 走 VN_READER 那份唯一真相
                    _t = (win.VN_READER?.sumExtract?.(_t) || '').trim();
                } else {
                    const _m = _t.match(/<content>([\s\S]*?)<\/content>/i);
                    if (_m) _t = _m[1];
                    _t = (win.VN_READER?.sumStrip ? win.VN_READER.sumStrip(_t) : _t.replace(/<summary>[\s\S]*?<\/summary>/gi, '')).trim();
                }
                _t = stripVnTags(_t);
                if (!_t) return;
                if (c.request) _lines.push(`[${userName}]: ${String(c.request).trim()}`);
                _lines.push(`[劇情]: ${_t}`);
            });
            if (!_lines.length) return '';
            console.log(`[OS_API standalone] 注入劇情正文 ${_ch.length} 章（最近 ${_keepN === null ? '全部' : _keepN} 章全文）`);
            return '### Reality Context (Story History)\nThis is the background story. Use this ONLY for context. DO NOT reply to the story directly. Stick to the APP FORMAT.\n\n'
                 + _lines.join('\n');
        },

        // --- 5. 獨立模式 Context Builder (精準掃描引擎) ---
        _buildStandaloneContext: async function(userMessage, promptKey) {
            const NO_COT_ROUTES = ['iris_chat', 'cheshire_chat'];   // 📞 通話「保留」CoT：AI 靠它讀世界書情感/規範條目想怎麼回；思考關進 <thinking> 由字幕端剝掉

            const apiMessages = [];

            let userName = this.getGlobalUserName();
            let userDesc = '';
            try {
                const persona = win.OS_PERSONA?.getCurrent?.() || {};
                if (persona.description || persona.desc) userDesc = persona.description || persona.desc;
            } catch(e) {}

            let sysPrompt = '', cotPrompt = '';
            if (win.OS_PROMPTS) {
                sysPrompt  = win.OS_PROMPTS.get(promptKey) || '';
                if (!NO_COT_ROUTES.includes(promptKey)) cotPrompt = win.OS_PROMPTS.get('universal_cot') || '';
            }

            // 📞 通話跟那間微信是同一個人：人設設置、聊天記錄都要一起給。
            //   以前這裡只認 wx_chat_system，PWA 上打電話過去，接起來的是一個不知道自己是誰、
            //   也不記得剛剛聊過什麼的人（她在人設寫「你是幫我確認微信的系統助手」，電話裡它說她在胡言亂語）。
            //   酒館那條路本來就兩個都認。
            const _isWxRoute = (promptKey === 'wx_chat_system' || promptKey === 'call_voice_system');
            const _isCall = (promptKey === 'call_voice_system');
            let charPersona = '';
            let _groupNote = '';
            let _wxChat = null;   // 這一間：記憶體那份優先；從電話 app 直接打、微信還沒開過就讀存檔
            if (_isWxRoute && win.wxApp?.GLOBAL_ACTIVE_ID) {
                try {
                    const _cid = win.wxApp.GLOBAL_ACTIVE_ID;
                    const _mem = win.wxApp.GLOBAL_CHATS?.[_cid] || null;
                    const _saved = win.WX_DB?.getApiChat ? await win.WX_DB.getApiChat(_cid) : null;
                    _wxChat = _mem || _saved;
                    // 人設／群聊備註：自己打的那段＋從世界書挑的那條（同酒館版；以前 PWA 只讀自己打的，挑的條目從來沒送）
                    const _notesOf = async (c) => {
                        if (!c) return { persona: '', group: '' };
                        if (c.isGroup) {
                            const lore = c.groupNoteFromLorebook ? await _wxLoreEntryText(c.groupNoteFromLorebook) : '';
                            return { persona: '', group: _wxJoinNote(c.groupNoteCustom, lore) };
                        }
                        const custom = c.personaCustom || (!c.personaFromLorebook ? (c.persona || '') : '');
                        const lore = c.personaFromLorebook ? await _wxLoreEntryText(c.personaFromLorebook, c.personaLoreBook) : '';
                        return { persona: _wxJoinNote(custom, lore), group: '' };
                    };
                    let _n = await _notesOf(_mem);
                    if (!_n.persona && !_n.group && _saved && _saved !== _mem) _n = await _notesOf(_saved);
                    charPersona = _n.persona;
                    _groupNote = _n.group;
                } catch(e) {}
            }
            // 🔑 {{char}}/{{user}} 換成真名（同酒館版）：直連 API 沒有人替它換，以前 PWA 送出去的就是字面上的 {{char}}
            if (_isWxRoute) {
                const _charName = (_wxChat && !_wxChat.isGroup && _wxChat.name) ? _wxChat.name : (_wxChat && _wxChat.isGroup ? '群裡的角色' : 'AI');
                // 這一間是不是群現在才知道 → 重拿一次系統提示，分私聊／群聊的包才挑得對
                if (_wxChat && win.OS_PROMPTS) sysPrompt = win.OS_PROMPTS.get(promptKey, { wxGroup: !!_wxChat.isGroup }) || '';
                sysPrompt = _wxResolveMacros(sysPrompt, _charName, userName);
                cotPrompt = _wxResolveMacros(cotPrompt, _charName, userName);
            }

            let scanText = userMessage || '';

            if (_isWxRoute && win.wxApp?.GLOBAL_ACTIVE_ID && win.WX_DB?.getApiChat) {
                try {
                    const chat = await win.WX_DB.getApiChat(win.wxApp.GLOBAL_ACTIVE_ID);
                    if (chat?.messages?.length) {
                        scanText += " " + chat.messages.slice(-5).map(m => {
                            let text = m.raw || m.content || "";
                            // 🔥 V3.24: 一併剔除 vars_analyze 以避免影響掃描
                            text = text.replace(/<(think(?:ing)?|vars_analyze)>[\s\S]*?<\/\1>/gi, '');
                            const match = text.match(/<content>([\s\S]*?)<\/content>/i);
                            if (match) text = match[1];
                            return text;
                        }).join(" ");
                    }
                } catch(e) {}
            } else if (promptKey === 'vn_story' && win.OS_DB?.getAllVnChapters) {
                try {
                    const chapters = await win.OS_DB.getAllVnChapters();
                    const currentStoryId = localStorage.getItem('vn_current_story_id') || '';
                    const storyChapters = currentStoryId ? chapters.filter(ch => ch.storyId === currentStoryId) : chapters.filter(ch => !ch.storyId);
                    
                    scanText += " " + storyChapters.slice(-3).map(ch => {
                        let req = ch.request || "";
                        let text = ch.content || "";
                        // 🔥 V3.24: 一併剔除 vars_analyze 以避免影響掃描
                        text = text.replace(/<(think(?:ing)?|vars_analyze)>[\s\S]*?<\/\1>/gi, '');
                        const match = text.match(/<content>([\s\S]*?)<\/content>/i);
                        if (match) text = match[1];
                        return req + " " + text;
                    }).join(" ");
                    
                    // 這裡原本還會去讀生成面板那兩個輸入框補進掃描文字 ——
                    //   但 scanText 的第一行就是 userMessage，而 userMessage 正是那個框裡的內容，
                    //   等於同一段話被算了兩次。面板已移除，這段連同重複一起拿掉。
                } catch(e) {}
            }

            const _iso = _wxIsolate(promptKey);   // 🧳 這間有沒有被隔離（手機聊天才認）
            let lore = '';
            // 世界書拆成兩半：_lorePre＝沒設深度的（VN 的「世界書」那一格用），
            //   _loreDepths＝設了深度的 [{depth,text}]，等一下插進對話歷史「倒數第 N 則之前」。
            //   lore 本身維持「全部」不變 —— 手機 app／大廳那些沒有深度概念的路徑照舊整包拿。
            let _lorePre = '';
            let _loreDepths = [];
            try {
                // 常駐書包(每本都用) ∪ 這本藏書自己掛的 —— 前者是酒館「全域世界書」的對應物，
                //   格式協議/BGM/音效清單那種跨故事的同一份放在那裡，不必每開一本新書重掛一次。
                let _activePacks = null;
                if (win.OS_WORLDBOOK?.getActivePacks) {
                    _activePacks = win.OS_WORLDBOOK.getActivePacks();
                } else {
                    const _rawPacks = localStorage.getItem('vn_active_wb_packs');
                    _activePacks = _rawPacks ? JSON.parse(_rawPacks) : null;
                }
                if (_activePacks && _activePacks.length && win.OS_WORLDBOOK?.getContextParts) {
                    // 分堆版：沒設深度的照舊進「世界書」那一格，設了深度的等一下插進對話歷史裡
                    const _parts = await win.OS_WORLDBOOK.getContextParts(_activePacks, scanText);
                    _lorePre = _parts.pre || '';
                    _loreDepths = _parts.depths || [];
                    // 印出這輪命中的條目：世界書「有寫沒進來」是最難查的一類 ——
                    //   規則條目常駐、清單條目靠關鍵字，清單沒被觸發時 prompt 裡就留下
                    //   「只能用以下清單：」後面一片空白，AI 只好自己編，而畫面上完全看不出來。
                    try {
                        const _h = _parts.hits || [];
                        console.log('[OS_API vn_story] 世界書命中 ' + _h.length + ' 條：' +
                            _h.map(x => x.title + (x.depth === null ? '' : '@D' + x.depth)).join('、'));
                    } catch (e) {}
                    lore = [_lorePre].concat((_loreDepths || []).map(d => d.text)).filter(Boolean).join('\n\n---\n\n');
                } else if (_activePacks && _activePacks.length && win.OS_WORLDBOOK?.getContextByPacks) {
                    lore = await win.OS_WORLDBOOK.getContextByPacks(_activePacks, scanText);
                    _lorePre = lore;
                } else if (win.OS_WORLDBOOK?.getEnabledContext) {
                    // 🚨 這條退路濾的是「世界書 app 當下正在看的那本書」，跟你正在玩的故事沒有關係。
                    //    走到這裡代表「這本書沒掛世界書書包」——以前它靜靜地把別本書的設定餵給主模型，
                    //    畫面上完全看不出來（症狀是 AI 一直提到另一個世界的人事物）。現在講清楚。
                    console.warn('[OS_API] ⚠️ 這本故事沒有掛世界書書包 → 退到「世界書 app 目前選的那本」，'
                        + '讀到的很可能不是這個世界的設定。去 藏書→這本書 重新匯入一次角色卡，或在世界書把書包掛上。');
                    lore = await win.OS_WORLDBOOK.getEnabledContext(scanText);
                    _lorePre = lore;
                }
            } catch(e) { console.warn('[OS_API standalone] 世界書載入失敗:', e); }

            try {
                const _avsRulesCtx = win.OS_AVS_RULES?.getActiveContext?.(_avsRead());
                if (_avsRulesCtx) {
                    lore = lore ? lore + '\n\n---\n\n' + _avsRulesCtx : _avsRulesCtx;
                    _lorePre = _lorePre ? _lorePre + '\n\n---\n\n' + _avsRulesCtx : _avsRulesCtx;
                }
            } catch(e) { console.warn('[OS_API standalone] AVS 條件規則載入失敗:', e); }

            // 🪶 VN 指令（os_vn_rules）：跟世界書 @D 那批同一套插法，只給 VN 正文。
            //   接在世界書後面：同一個深度裡排序是穩定的，VN 指令會比世界書條目更貼近生成點。
            if (promptKey === 'vn_story') {
                try {
                    const _vr = win.OS_VN_RULES?.getDepthParts?.() || [];
                    if (_vr.length) _loreDepths = (_loreDepths || []).concat(_vr);
                } catch (e) { console.warn('[OS_API vn_story] VN 指令載入失敗:', e); }
            }

            if (cotPrompt) apiMessages.push({ role: 'system', content: `### \n${cotPrompt}` });
            apiMessages.push({ role: 'system', content: `### Roleplay Instruction\n${sysPrompt}` });

            let avsPrompt = '';
            try {
                const avsState = _avsRead();
                if (Object.keys(avsState).length > 0) {
                    avsPrompt = `[SYSTEM: Current Dynamic Variables (AVS)]\n${JSON.stringify(avsState)}`;
                }
            } catch(e) {}

            if (promptKey === 'vn_story') {
                const _promptOrder = (() => {
                    try {
                        const s = JSON.parse(localStorage.getItem('vn_prompt_order') || '[]');
                        if (Array.isArray(s) && s.length) return s;
                    } catch(e) {}
                    return ['cot', 'main_prompt', 'worldbook', 'persona', 'vn_history'];
                })();

                const _vnMsgs = [];
                let _stCh = [];
                let _grandSummaryBlock = '';   // 在外層宣告：它現在是順序表裡自己一格，要在下面的組裝迴圈用得到
                // 🚨 _sid 也必須在外層：它原本宣告在下面那個 try 區塊裡，而向量召回在區塊外面用它 →
                //   每次都丟 ReferenceError、被召回自己的 catch 吞掉只留一行 warn。
                //   也就是說 PWA 的記憶召回一直沒有真的注入過，只是沒人看 console 所以沒發現。
                const _sid = localStorage.getItem('vn_current_story_id') || '';
                if (win.OS_DB?.getAllVnChapters) {
                    try {
                        // 全系統唯一那格(劇情設置 ctxChapters)：N＝最近 N 章全文、0＝全部只讀摘要、null＝全送。
                        //   以前這裡寫 `ctxChapters || '5'`，0 會被當成假值換成 5 → 設 0 根本沒作用。
                        const _ctxN = win.OS_APP_CTX_MSGS ? win.OS_APP_CTX_MSGS() : 5;
                        const _allCh  = await win.OS_DB.getAllVnChapters();
                        // _sid 已在外層宣告(向量召回也要用)
                        _stCh     = _sid
                            ? _allCh.filter(ch => ch.storyId === _sid)
                            : _allCh.filter(ch => !ch.storyId);

                        // 查詢大總結，過濾已覆蓋章節
                        // _grandSummaryBlock 已在外層宣告(順序表要用)，這裡只賦值
                        if (win.OS_DB?.getGrandSummaries) {
                            const _summaries = await win.OS_DB.getGrandSummaries(_sid);
                            if (_summaries.length > 0) {
                                // 取最新一筆（count 最大）
                                const _latest = _summaries.reduce((a, b) => (a.count >= b.count ? a : b));
                                const _coveredIds = new Set(_latest.coveredChapterIds || []);
                                if (_coveredIds.size > 0) {
                                    _stCh = _stCh.filter(ch => !_coveredIds.has(ch.id));
                                }
                                // 注入壓縮版(丟結算清單/代辦/物品表、事件與性事紀限筆數)，跟酒館同一支處理器。
                                //   原本是把整份原文每輪送進去 → 總結一長 token 就跟著長。
                                //   壓縮器切不出區塊(舊格式總結)會自己退回全文，不會變空。
                                let _sumTxt = _latest.content;
                                try {
                                    const _packed = win.OS_STORY_TOOLS?.buildInjectionPayload?.(_latest.content);
                                    if (_packed && _packed.trim()) _sumTxt = _packed;
                                } catch (e) { console.warn('[OS_API vn_story] 大總結壓縮失敗，用全文:', e); }
                                _grandSummaryBlock = `【大總結（第${_latest.count}次）】\n${_sumTxt}`;
                                console.log(`[OS_API vn_story] 大總結注入：第${_latest.count}次，已過濾 ${_coveredIds.size} 章，${_latest.content.length}→${_sumTxt.length} 字`);
                            }
                        }

                        _stCh.reverse().forEach((ch, idx, arr) => {
                            let _c = ch.content || '';
                            if (!_c) return;
                            _c = _c.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // 先剝 CoT：思考區提到 <content> 會從 CoT 開抓
                            const _isRecent = (_ctxN === null) || (idx >= arr.length - _ctxN);
                            if (!_isRecent) {
                                // 摘要標記可能被改成別家 preset 的(<meow_FM>/<draft>…)→ 走 VN_READER 那份唯一真相；
                                //   以前寫死 <summary>，換 preset 後這裡抓不到就把整章壓成空字串＝那章直接從歷史消失。
                                _c = (win.VN_READER?.sumExtract?.(_c) || '').trim();
                            } else {
                                const _m = _c.match(/<content>([\s\S]*?)<\/content>/i);
                                if (_m) _c = _m[1].trim();
                                _c = (win.VN_READER?.sumStrip ? win.VN_READER.sumStrip(_c) : _c.replace(/<summary>[\s\S]*?<\/summary>/gi, '')).trim();
                            }
                            // 🎲 自由模式：歷史裡的表情格要剝掉，不然 AI 照著上下文範例繼續寫表情格
                            //    （酒館是靠一條 promptOnly 正則做同一件事，PWA 的歷史是這裡拼的）
                            if (_c && win.VN_FREE_MODE?.effectiveFree?.()) _c = win.VN_FREE_MODE.stripEmotionCol(_c);
                            // ⚔️ 戰鬥結果寫在 </content> 之後（寫進 content 會被 VN 當旁白唸出來）→
                            //    上面那個 <content> 擷取會把它整段切掉，AI 下一輪就不知道這仗打成什麼樣，
                            //    只好自己編一個戰果接下去。酒館是讀整則訊息原文才拿得到它，
                            //    PWA 的歷史是這裡拼的，所以要自己補回來。
                            //    只補敘事那句；[BattleResult|…] 是給程式讀的數值（酒館用 promptOnly 剝掉），不餵 AI。
                            const _afterContent = (ch.content || '').split(/<\/content>/i).slice(1).join('');
                            const _battleNarr = _afterContent.match(/（戰鬥結果：[\s\S]*?）/g);
                            if (_battleNarr && _battleNarr.length) _c = (_c ? _c + '\n\n' : '') + _battleNarr.join('\n');
                            if (ch.request) _vnMsgs.push({ role: 'user', content: ch.request });
                            if (_c) _vnMsgs.push({ role: 'assistant', content: _c });
                        });

                        // 大總結不再 unshift 進歷史陣列：它現在是順序表裡自己一格(grand_summary)，
                        //   預設就排在 vn_history 前面＝跟以前同一個位置，但可以被拖走。
                    } catch(e) { console.warn('[OS_API vn_story] VN 歷史載入失敗:', e); }
                }

                // ── 故事時間掃描（從章節 summary 抽最新「故事時間:」）──
                let _latestStoryTime = '';
                for (const _ch of _stCh) {
                    const _sumTxt = win.VN_READER?.sumExtract?.(_ch.content || '') || '';
                    if (!_sumTxt) continue;
                    const _tMatch = _sumTxt.match(/故事時間\s*[:：]\s*(.+)/);
                    if (_tMatch) _latestStoryTime = _tMatch[1].trim();
                }

                // ── 記憶召回先算好：它要當順序表裡的一格，就不能等迴圈跑完才 await ──
                let _recallBlock = '';
                if (win.OS_VECTOR_ENGINE?.isEnabled?.() === true && userMessage) {
                    try {
                        const _memories = await win.OS_VECTOR_ENGINE.search(userMessage, _sid);
                        if (_memories.length > 0) {
                            _recallBlock = `[記憶召回]\n`;
                            if (_latestStoryTime) _recallBlock += `當前故事時間：${_latestStoryTime}\n\n`;
                            for (const _m of _memories) {
                                _recallBlock += `[${_m.type || 'event'}] ${_m.text}`;
                                if (_m.tags?.length) _recallBlock += `（${_m.tags.join('、')}）`;
                                _recallBlock += '\n';
                            }
                            _recallBlock = _recallBlock.trim();
                            console.log(`[OS_API vn_story] 向量召回：${_memories.length} 條記憶`);
                        }
                    } catch(_ve) { console.warn('[OS_API vn_story] 向量召回失敗:', _ve); }
                }

                // ── 兩個「酒館靠 injectPrompts、PWA 沒有那條路」的注入源：也要先算好才排得進順序表 ──
                //   掃描文字用 scanText（最近三章正文＋這次輸入），跟世界書關鍵字觸發同一份，
                //   名字命中才注入完整檔案／手機近況，不在場的角色不佔 token。
                let _npcBlock = '', _appMemBlock = '';
                try { _npcBlock = (await win.OS_NPC_DOSSIER?.buildBlock?.(scanText)) || ''; }
                catch (_e) { console.warn('[OS_API vn_story] NPC 人物檔案組裝失敗:', _e); }
                try { _appMemBlock = (await win.OS_APP_MEMORY_INJECT?.buildAppMemoryBlock?.(scanText)) || ''; }
                catch (_e) { console.warn('[OS_API vn_story] 手機近況組裝失敗:', _e); }
                let _mcBlock = '';
                try { _mcBlock = (await win.OS_MC_STATUS?.buildBlock?.()) || ''; }
                catch (_e) { console.warn('[OS_API vn_story] 主角狀態組裝失敗:', _e); }

                // 把對話歷史推進去，順便把「設了深度」的世界書條目插到對應位置。
                //   depth N ＝ 倒數第 N 則之前；0 ＝ 全部歷史之後（最貼近這一輪，最不容易被忘掉）。
                //   由大到小插，先插的不會被後插的位移影響。
                //   🚨 這是酒館 position:4/@D 的對應物 —— 沒有它的話整本書只能一起壓在歷史之前，
                //      幾千字歷史一蓋就把格式規則沖掉（[Avatar|] 老是掉就是這樣來的）。
                const _ST_ROLE = { 0: 'system', 1: 'user', 2: 'assistant' };
                const _injectHistoryWithDepths = (out, msgs, depths) => {
                    const buf = (msgs || []).slice();
                    // 深度大的先插（先插的不會被後插的位移）；同深度內 AI → 使用者 → 系統，
                    //   跟酒館 doChatInject 一樣把系統留在最靠近生成點的位置。
                    (depths || []).slice()
                        .sort((a, b) => (b.depth - a.depth) || ((b.role || 0) - (a.role || 0)))
                        .forEach(d => {
                            if (!d || !d.text) return;
                            const at = Math.max(0, buf.length - Math.max(0, d.depth | 0));
                            buf.splice(at, 0, { role: _ST_ROLE[d.role || 0] || 'system', content: d.text });
                        });
                    buf.forEach(m => out.push(m));
                    if ((depths || []).length) {
                        console.log('[OS_API vn_story] 世界書 @D 注入：' +
                            depths.map(d => '@D' + d.depth + '/' + (_ST_ROLE[d.role || 0] || 'system') +
                                '(' + d.text.length + '字)').join('、'));
                    }
                };

                const _vn = [];
                const _entryMap = Object.fromEntries((win.OS_PROMPTS?.getEntries?.() || []).map(e => [e.id, e]));
                const _vnBundles = (win.OS_PROMPTS?.getBundles?.() || [])
                    .filter(b => b.enabled !== false && (b.panels||[]).some(p => 'vn_story' === p || 'vn_story'.startsWith(p + '_') || 'vn_story'.startsWith(p)))
                    .sort((a, b) => { const ai = _promptOrder.indexOf(a.id), bi = _promptOrder.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
                const _injectedSys = new Set(); 
                for (const _bundle of _vnBundles) {
                    for (const _item of (_bundle.items || [])) {
                        if (_item.type === 'sys') {
                            if (_injectedSys.has(_item.id)) continue;
                            _injectedSys.add(_item.id);
                            if      (_item.id === 'cot'          && cotPrompt) _vn.push({ role: 'system', content: `### \n${cotPrompt}` });
                            // 只要格式協議本身。用 getSystemPrompt 會把整包(條目＋格式)重組一遍，
                            //   而條目在下面 _item.type==='entry' 那條會各自 push → 每條被送兩次。
                            else if (_item.id === 'panel_prompt')              { const fmt = win.OS_PROMPTS?.getPanelFormat?.('vn_story') || win.OS_PROMPTS?.getFormat?.('vn_story') || ''; if (fmt) _vn.push({ role: 'system', content: fmt }); }
                            else if (_item.id === 'worldbook'   && _lorePre)   _vn.push({ role: 'system', content: `[World Info]:\n${_lorePre}` });
                            else if (_item.id === 'persona'     && (userDesc || userName !== 'User'))  _vn.push({ role: 'system', content: `[User Info (${userName})]:\n${userDesc || '(玩家本人)'}` });
                            else if (_item.id === 'vn_history') _injectHistoryWithDepths(_vn, _vnMsgs, _loreDepths);
                            else if (_item.id === 'grand_summary' && _grandSummaryBlock) _vn.push({ role: 'system', content: _grandSummaryBlock });
                            else if (_item.id === 'memory_recall' && _recallBlock)       _vn.push({ role: 'system', content: _recallBlock });
                            else if (_item.id === 'avs_vars'      && avsPrompt)          _vn.push({ role: 'system', content: avsPrompt });
                            else if (_item.id === 'npc_dossier'   && _npcBlock)          _vn.push({ role: 'system', content: _npcBlock });
                            else if (_item.id === 'app_memory'    && _appMemBlock)       _vn.push({ role: 'system', content: _appMemBlock });
                            else if (_item.id === 'mc_status'     && _mcBlock)           _vn.push({ role: 'system', content: _mcBlock });
                        } else if (_item.type === 'entry') {
                            const _e = _entryMap[_item.id];
                            if (_e?.enabled !== false && _e?.content?.trim()) _vn.push({ role: 'system', content: _e.content.trim() });
                        }
                    }
                }
                
                // 一個包都沒有(還沒建過提示詞包)：照出廠順序自己排一份，跟 DEFAULT_SYS_ITEMS 一致
                if (_vnBundles.length === 0) {
                    if (sysPrompt)  _vn.push({ role: 'system', content: `### Roleplay Instruction\n${sysPrompt}` });
                    if (_lorePre)   _vn.push({ role: 'system', content: `[World Info]:\n${_lorePre}` });
                    if (userDesc || userName !== 'User') _vn.push({ role: 'system', content: `[User Info (${userName})]:\n${userDesc || '(玩家本人)'}` });
                    if (_grandSummaryBlock) _vn.push({ role: 'system', content: _grandSummaryBlock });
                    _injectHistoryWithDepths(_vn, _vnMsgs, _loreDepths);
                    if (_appMemBlock) _vn.push({ role: 'system', content: _appMemBlock });
                    if (_npcBlock)    _vn.push({ role: 'system', content: _npcBlock });
                    if (_mcBlock)     _vn.push({ role: 'system', content: _mcBlock });
                    if (_recallBlock) _vn.push({ role: 'system', content: _recallBlock });
                    if (avsPrompt)    _vn.push({ role: 'system', content: avsPrompt });
                }

                // 🚨 安全網：三格有內容、卻沒有任何一個包排到它 → 那個包多半沒配到 vn_story(遷移補錯地方)。
                //   靜靜少注入＝整份長期記憶消失、而且畫面上完全看不出來，所以這裡補回去並且出聲，別讓它無聲無息。
                if (_vnBundles.length) {
                    const _late = [['grand_summary', _grandSummaryBlock], ['memory_recall', _recallBlock], ['avs_vars', avsPrompt],
                                   ['app_memory', _appMemBlock], ['npc_dossier', _npcBlock], ['mc_status', _mcBlock]];
                    for (const [_id, _content] of _late) {
                        if (!_content || _injectedSys.has(_id)) continue;
                        console.warn(`[OS_API vn_story] 順序表裡找不到「${_id}」這一格 → 補在最後面。去提示詞窗口把它拖到你要的位置。`);
                        _vn.push({ role: 'system', content: _content });
                    }
                }

                if (userMessage) {
                    const _cotReminder = `\n\n[SYS]\n上面是新收到的訊息。回覆前先在 <thinking> 裡想清楚，想完再寫正文。`;
                    _vn.push({ role: 'user', content: userMessage + _cotReminder });
                }

                console.log(`[OS_API vn_story] Context 組裝完成：${_vn.length} 段 | 包：${_vnBundles.map(b=>b.name).join(' → ')}`);
                return _vn;
            }

            // 🚫 大廳(iris/cheshire)自足：不吃當前 persona/世界書/AVS 變數，避免跨卡污染(同酒館路徑)
            const _NO_CARD_STD = (promptKey === 'iris_chat' || promptKey === 'cheshire_chat');
            let contextBlock = '';
            if (!_NO_CARD_STD) {
                if (userDesc || userName !== 'User') {
                    contextBlock += `[User Info (${userName})]:\n${userDesc || '(玩家本人)'}\n`;
                    // 同酒館版：講明她就是正在聊天的本人，不然劇情歷史裡滿是主角名字，模型會把她當成另一個角色
                    if (_isWxRoute) contextBlock += `⚠️ ${userName} 就是正在跟你聊天的真實使用者本人；你回覆與稱呼的對象永遠是 ${userName}，絕對不要把他當成劇情裡的其他角色或 NPC。\n`;
                    contextBlock += '\n';
                }
                if (promptKey === 'wx_chat_system') {
                    const _nk = _wxNickNote(userName);   // 微信暱稱（共用）
                    if (_nk) contextBlock += _nk + '\n\n';
                }
                if (charPersona)  contextBlock += `[Character Persona (Private Chat)]:\n${charPersona}\n\n`;
                if (_groupNote)   contextBlock += `[Group Note]:\n${_groupNote}\n\n`;
                if (lore && !_iso.lore) contextBlock += `[World Info]:\n${lore}\n\n`;
            }
            if (contextBlock) apiMessages.push({ role: 'system', content: contextBlock });

            // 📒 記事本目錄：一對一的微信與通話（同酒館版，見 wx_notebook.js brief）
            if (_isWxRoute && win.wxApp?.GLOBAL_ACTIVE_ID) {
                try {
                    const _nbChat = win.wxApp.GLOBAL_CHATS?.[win.wxApp.GLOBAL_ACTIVE_ID];
                    const _nb = win.WX_NOTEBOOK;
                    if ((!_nbChat || !_nbChat.isGroup) && _nb && _nb.brief) {
                        const _nbt = await _nb.brief(win.wxApp.GLOBAL_ACTIVE_ID, { call: _isCall });
                        if (_nbt) apiMessages.push({ role: 'system', content: _nbt });
                    }
                } catch (e) { console.warn('[OS_API standalone] 記事本目錄組裝失敗（不影響送出）', e); }
                // 🫂 朋友圈（同酒館版）；通話不給
                if (!_isCall) {
                    try {
                        const _mo = win.WX_MOMENTS;
                        if (_mo && _mo.brief) {
                            const _mot = await _mo.brief(win.wxApp.GLOBAL_ACTIVE_ID);
                            if (_mot) apiMessages.push({ role: 'system', content: _mot });
                        }
                    } catch (e) { console.warn('[OS_API standalone] 朋友圈組裝失敗（不影響送出）', e); }
                }
            }

            // ── 劇情長期記憶 + 劇情正文：手機 app 也要知道劇情發生了什麼 ──────────────────
            //   酒館那條路早就有（大總結壓縮版 ＋ ### Reality Context (Story History)），
            //   獨立版一直完全沒有 → PWA 的微信/電話/微薄不知道劇情走到哪，只能靠 app 內的對話瞎猜。
            //   正文來源是 OS_DB 章節（PWA 沒有聊天樓），保留幾章全文照全系統唯一那格 ctxChapters。
            const _NO_HISTORY_STD = ['iris_chat', 'cheshire_chat', 'general_assistant'];   // 工具型生成不背劇情
            const _lobbySeeStory = _NO_CARD_STD && localStorage.getItem('lobby_npc_see_current_story') === '1';
            if (!_iso.story && (!_NO_HISTORY_STD.includes(promptKey) || _lobbySeeStory)) {
                // 大總結：跟酒館同一支壓縮器、同一顆開關
                try {
                    if (localStorage.getItem('sp_app_inject_summary') !== '0' && win.OS_STORY_TOOLS?.getCurrentInjectionPayload) {
                        const _sum = await win.OS_STORY_TOOLS.getCurrentInjectionPayload();
                        if (_sum && _sum.trim()) {
                            apiMessages.push({ role: 'system', content: `[劇情總結 — 至今為止的劇情長期記憶，延續勿矛盾]\n${_sum}` });
                            console.log(`[OS_API standalone] 注入大總結壓縮版 ${_sum.length} 字 (route: ${promptKey})`);
                        }
                    }
                } catch (e) { console.warn('[OS_API standalone] 大總結注入失敗:', e); }

                try {
                    const _reality = await this._buildStoryReality(userName);
                    if (_reality) apiMessages.push({ role: 'system', content: _reality });
                } catch (e) { console.warn('[OS_API standalone] 劇情正文注入失敗:', e); }
            }

            // 🧭 世界狀態當背景，附上「別把欄位名跟數字寫進訊息」（同酒館版，共用那支）
            if (_isWxRoute) {
                const _avsBg = _wxAvsBackground();
                if (_avsBg) apiMessages.push({ role: 'system', content: _avsBg });
            }
            if (avsPrompt && !_NO_CARD_STD) apiMessages.push({ role: 'system', content: avsPrompt });

            if (_isWxRoute && win.WX_DB?.getApiChat && win.wxApp?.GLOBAL_ACTIVE_ID) {
                try {
                    // 保留最近幾則全文、更舊的縮成摘要（判讀跟酒館那條路共用 OS_APP_CTX_MSGS）。
                    //   以前這裡是全開/全關的「僅讀取摘要」，關著就整包全吃、完全沒有上限。
                    const _keepN = win.OS_APP_CTX_MSGS ? win.OS_APP_CTX_MSGS() : 10;

                    const apiChat = await win.WX_DB.getApiChat(win.wxApp.GLOBAL_ACTIVE_ID);
                    // 🧭 這一間是誰、還能傳到哪幾間：搬到整包最後面，見 _wxRoomsNoteLate（同酒館版）
                    // 🖼 換頭像／約定／改名改簽名／它記得我頭像的樣子（同酒館版；以前 PWA 這條完全沒有，角色不知道能換頭像）
                    if (promptKey === 'wx_chat_system') {
                        _wxAbilityBlocks(win.wxApp.GLOBAL_ACTIVE_ID).forEach(m => apiMessages.push(m));
                        // 😺 這一間指定的表情包庫（同酒館版，共用那支）
                        const _stk = _wxStickerLibBlock(apiChat);
                        if (_stk) apiMessages.push({ role: 'system', content: _stk });
                    }
                    // 📞 故事時鐘的當前日期：通話分隔要標是哪一天（同酒館版）
                    let _stNow = null;
                    try { const S = win.OS_MC_STATUS; if (S && S.load) { const _st = await S.load(); _stNow = (_st && _st.date) || null; } } catch (e) {}
                    if (apiChat?.messages?.length) {
                        // 📒 聊天室長期記憶：跟酒館那條路共用同一份（存在 apiChat.wxSummary）。
                        //    這邊本來就有「保留最近幾則」的上限（OS_APP_CTX_MSGS），窗口機制不動，只把摘要補上。
                        try {
                            const _sumTxt = win.WX_SUMMARY?.injectionText?.(apiChat);
                            if (_sumTxt) apiMessages.push({ role: 'system', content: _sumTxt });
                        } catch (e) { console.warn('[OS_API standalone] 聊天室記憶注入失敗:', e); }
                        // 🚨 先用聊天室記憶切窗口再說。上面那個 _keepN 只是把舊訊息換成它自己的
                        //    <summary> 標籤，而微信訊息根本沒有那種標籤 → sumExtract 抓不到就退回全文，
                        //    等於完全沒有上限（實測 120 則全帶）。窗口一定要在這之前先切。
                        let _histMsgs = (win.WX_SUMMARY && win.WX_SUMMARY.recentWindow)
                            ? win.WX_SUMMARY.recentWindow(apiChat) : apiChat.messages;
                        // 🎯 同酒館版：還沒回的那幾則交給 OS_API.wxPendingTurn 排在整包最後面
                        if (promptKey === 'wx_chat_system') {
                            const _sp = _wxPendingSplit(_histMsgs);
                            if (_sp.pending.length) _histMsgs = _histMsgs.slice(0, _sp.pastEnd + 1);
                        }
                        const _tAware = _wxTimeAware(apiChat);   // ⏰ 這一間有沒有開時間感知（同酒館版）
                        const _cut = _keepN === null ? -1 : _histMsgs.length - _keepN;
                        let _pushedHist = 0;
                        // 📞 這一通已經接通：「以上是以前」那句放在這一通開始的地方（同酒館版）
                        const _curCallAt = _isCall ? _openCallAt(_histMsgs, apiChat.messages) : -1;
                        _histMsgs.forEach((msg, _i) => {
                            const useSummary = _i < _cut;
                            if (_i === _curCallAt) {
                                apiMessages.push({ role: 'system', content: _CALL_NOW_NOTE });
                                _pushedHist++;
                                if (msg && msg._callStart) return;
                            }
                            if (!msg) return;
                            if (_wxBlockSkip(msg, apiChat)) return;   // 對方沒收到的那幾則（同酒館版）
                            { const _bn = _wxMeBlockNote(msg, _histMsgs[_i - 1], userName); if (_bn) { apiMessages.push({ role: 'system', content: _bn }); _pushedHist++; } }
                            // ⏰ 畫面上的時間分隔是 AI 自己寫的 [Time]，不是誰講的話（同酒館版）
                            if (msg.type === 'time') {
                                if (_tAware) { const _t = String(msg.content || '').trim(); if (_t) { apiMessages.push({ role: 'system', content: '（' + _t + '）' }); _pushedHist++; } }
                                return;
                            }
                            // ⏰ 隔得夠久標一句（只在這一間開了時間感知時）
                            if (_tAware) { const _g = _wxGapNote(_histMsgs[_i - 1], msg); if (_g) { apiMessages.push({ role: 'system', content: _g }); _pushedHist++; } }
                            // 📞 系統行不是誰講的話 → 旁註（同酒館版，共用 _wxSysNote）。
                            //   以前 PWA 只有通話這樣處理：微信裡的改名、紅包領取、換頭像這些被當成對方講的話；通話分隔也沒標是哪一天。
                            if (msg.type === 'system') {
                                const _note = _wxSysNote(msg, _stNow);
                                if (_note) { apiMessages.push({ role: 'system', content: _note }); _pushedHist++; }
                                return;
                            }
                            // ↩ 撤回的：寫成旁註（同酒館版）
                            if (msg.recalled) {
                                const _rn = _recallNote(msg, _histMsgs, _i, userName);
                                if (_rn) { apiMessages.push({ role: 'system', content: _rn }); _pushedHist++; }
                                return;
                            }
                            // 📞 通話餵乾淨口語（content），不帶 [Chat:|With:][名] 標頭的 raw，免得它在電話裡學聊天格式（同酒館版）
                            let content = _isCall ? (msg.content || '') : _wxStripHeads(msg.raw || msg.content || '');
                            if (!content) return;
                            // 📷 相簿照片的圖庫編號 → 它看過寫下的那句（跟酒館版 buildContext 同一支）
                            try { const _pt = win.wxApp && win.wxApp.photoContextText; if (_pt) content = _pt(msg, content); } catch (e) {}
                            try { const _sc = win.wxApp && win.wxApp.stripCardIds; if (_sc) content = _sc(content); } catch (e) {}
                            content = content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // 先剝 CoT：思考區提到 <content> 會從 CoT 開抓

                            if (useSummary) {
                                const _s = win.VN_READER?.sumExtract?.(content) || '';
                                content = _s ? _s : content;
                            } else {
                                const match = content.match(/<content>([\s\S]*?)<\/content>/i);
                                if (match) content = match[1].trim();
                                content = (win.VN_READER?.sumStrip ? win.VN_READER.sumStrip(content) : content.replace(/<summary>[\s\S]*?<\/summary>/gi, '')).trim();
                            }

                            if (content) {
                                apiMessages.push({ role: msg.isMe ? 'user' : 'assistant', content });
                                _pushedHist++;
                            }
                        });
                        // 📞 收尾：講清楚上面全是過去的事（同酒館版）。通話還在響鈴才補「新接起來的一通」，接通了那句已經放在這一通開頭；
                        //   微信以前 PWA 沒有這句，模型會把幾天前的話當成剛剛才講的
                        if (_pushedHist && _curCallAt < 0) {
                            apiMessages.push({ role: 'system', content: _isCall
                                ? (_tAware ? _CALL_PAST_NOTE : _CALL_PAST_NOTE_NOTIME)
                                : _wxPastNote(_tAware) });
                        }
                    }
                    // 🔗 記憶關聯（同酒館版）
                    if (apiChat) {
                        try {
                            const _lmTxt = await _wxLinkedMemory(apiChat, userName, (id) => win.WX_DB.getApiChat(id));
                            if (_lmTxt) apiMessages.push({ role: 'system', content: _lmTxt });
                        } catch (e) { console.warn('[OS_API standalone] 記憶關聯注入失敗:', e); }
                    }
                } catch(e) { console.warn('[OS_API standalone] 聊天歷史載入失敗:', e); }
            }

            await _wxRoomsNoteLate(apiMessages, promptKey);   // 🧭 代號清單貼在最後面（同酒館版）
            if (userMessage) {
                let finalUserMsg = userMessage;
                const cotReminder = `\n\n[SYS]\n上面是新收到的訊息。回覆前先在 <thinking> 裡想清楚，想完再寫正文。`;
                finalUserMsg += cotReminder;
                apiMessages.push({ role: 'user', content: finalUserMsg });
            }

            console.log(`[OS_API standalone] Context 組裝完成：${apiMessages.length} 段，世界書 ${lore.length} 字`);
            return apiMessages;
        }
    };

    win.WX_API = win.OS_API;

    // --- 4. OS_API_ENGINE 獨立應用暴露介面 ---
    win.OS_API_ENGINE = {
        generateText: async function(promptKey, userMessage, callOptions) {
            return new Promise(async (resolve, reject) => {
                try {
                    let config = {};
                    if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                        config = win.OS_SETTINGS.getConfig();
                    } else {
                        const rawCfg = localStorage.getItem('os_global_config');
                        if (rawCfg) config = JSON.parse(rawCfg);
                    }
                    // 工具型路由(煉丹等 general_assistant)不背 preset 自訂條目——只要乾淨指令+角色卡/世界書(歷史由 NO_HISTORY_ROUTES 擋)
                    if (promptKey === 'general_assistant') config = Object.assign({}, config, { usePresetPrompts: false });

                    const messages = await win.OS_API.buildContext(userMessage, promptKey);

                    win.OS_API.chat(
                        messages,
                        config,
                        (chunk) => { /* 忽略串流輸出，直接等待結果 */ },
                        (finalText) => { resolve(finalText); },
                        (err) => { reject(err); },
                        Object.assign({ disableTyping: true }, callOptions || {}) // 告知不使用打字機效果，加速回傳；callOptions 帶 task（是哪件事）
                    );
                } catch (e) {
                    console.error("[OS_API_ENGINE] generateText 執行失敗:", e);
                    resolve(""); 
                }
            });
        },

        startStandaloneStory: async function(sessionPayload) {
            console.log("[OS_API_ENGINE] 啟動獨立劇情:", sessionPayload);

            localStorage.setItem('vn_current_story_id', sessionPayload.entityId);
            localStorage.setItem('vn_current_story_title', sessionPayload.title);

            if (win.OS_DB && typeof win.OS_DB.saveVnChapter === 'function') {
                await win.OS_DB.saveVnChapter({
                    storyId: sessionPayload.entityId,
                    request: "【系統：載入視差宇宙節點】", 
                    content: sessionPayload.startPrompt 
                });
            } else {
                console.warn("[OS_API_ENGINE] 找不到 OS_DB.saveVnChapter，無法儲存開場紀錄");
            }

            if (win.dispatchEvent) {
                const event = new CustomEvent('VN_STORY_STARTED', { detail: sessionPayload });
                win.dispatchEvent(event);
            }
        }
    };

    console.log('[PhoneOS] API 引擎 (V3.24 - 終極完整版：支援 <vars_analyze> 思考鏈) 就緒');
})();