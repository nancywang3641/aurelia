// ----------------------------------------------------------------
// [檔案] os_summary_inject.js (V1)
// 路徑：os_phone/os/os_summary_inject.js
// 職責：酒館版「大總結」程式注入器。
//       大總結已搬出世界書、改存 OS_DB tavern_summary（key=chatId、一卡一筆全文）。
//       這裡每輪生成前把「壓縮版」(事件只留最近10、物品只留活著的、丟結算清單) 注入主模型 prompt，
//       綁定 chatId、不污染別張卡——做法完全照 os_vector_inject.js：
//         GENERATION_STARTED → 讀 OS_DB → 壓縮 → injectPrompts({once:true})
//       只在「酒館（非獨立）」跑；PWA 走 buildContext、不碰。
// 依賴：window.OS_STORY_TOOLS.getCurrentInjectionPayload / getChatId
//       window.TavernHelper.injectPrompts
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('📜 [Grand Summary Injector] 載入');
    const win = window.parent || window;

    const INJECT_ID = 'aurelia_grand_summary';
    let _lastUninject = null;
    const _cache = new Map();   // chatId → 壓縮注入字串（避免每輪重讀+重壓；存檔/編輯後由 invalidate 清掉）
    let _lastInjected = null;   // 給 debug/CTX 面板看：{ chatId, text, len }
    const _dbg = (m) => { try { console.log('📜[大總結診斷] ' + m); } catch (e) {} };   // 🔧 臨時診斷（確診後移除）；輸出進螢幕 console 🐛

    function _chatId() {
        try { return win.OS_STORY_TOOLS?.getChatId?.() || ''; } catch (e) { return ''; }
    }

    async function _payloadFor(chatId) {
        if (_cache.has(chatId)) return _cache.get(chatId);
        let payload = '';
        try { payload = (await win.OS_STORY_TOOLS?.getCurrentInjectionPayload?.()) || ''; } catch (e) { payload = ''; }
        // 🔑 只快取「非空」payload：偶發空(OS_DB 還沒 ready / chatId 當下不一致 / 時序)若被釘進快取，
        //    之後每輪都命中空、永遠不注入＝整個 session 失憶，要換 chat 才解。這正是「時有時無→這次又沒了」的元兇。
        //    對照 VN 組件每輪重讀 localStorage 永遠有值、屹立不倒；大總結這層空快取才是病灶。
        //    代價：還沒生成大總結的聊天每輪會重讀一次 OS_DB（getTavernSummary 很快），可接受。
        if (payload) _cache.set(chatId, payload);
        return payload;
    }

    async function injectSummary() {
        try {
            // 撤上次（避免疊加 / 切 chat 殘留）
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;
            _lastInjected = null;

            // 正在跑大總結（os_story_tools 的 generateRaw）→ 別把大總結摻進總結 prompt
            if (win.__AURELIA_SUMMARIZING) { _dbg('跳過：正在跑大總結(__AURELIA_SUMMARIZING=true)'); return; }
            // 只在酒館跑；PWA 走 buildContext，不重複
            if (win.OS_API?.isStandalone?.()) { _dbg('跳過：判定為 PWA(isStandalone=true)'); return; }
            if (!win.TavernHelper?.injectPrompts) { _dbg('跳過：無 TavernHelper.injectPrompts'); return; }
            if (!win.OS_STORY_TOOLS?.getCurrentInjectionPayload) { _dbg('跳過：無 OS_STORY_TOOLS.getCurrentInjectionPayload'); return; }

            const chatId = _chatId();
            if (!chatId) { _dbg('跳過：chatId 空（getChatId 取不到）'); return; }

            const payload = await _payloadFor(chatId);
            if (!payload) { _dbg('跳過：payload 空 → chatId=' + JSON.stringify(chatId) + (_cache.has(chatId) ? '(命中cache、被快取成空)' : '(現抓即空、OS_DB無此chatId大總結或壓縮成空)')); return; }   // 這個聊天室還沒大總結

            const block =
                `<劇情總結 規則="既成事實·寫作前必讀·不得矛盾">\n` +
                `下列是本劇「至今為止」的劇情總結（結語＝整體走向總記憶；事件表＝至今完整劇情線，久遠已壓成階段節點、最近逐筆；物品表只列當前持有）。` +
                `你必須延續這些事實、保持前後連貫，嚴禁遺忘、改寫或與之矛盾。\n\n` +
                payload +
                `\n</劇情總結>`;

            // 注入深度(in_chat)：數字越小越貼最新訊息＝模型注意力越高；越大越往聊天頂＝注意力越低。
            //   🐛 修正史：舊 session 把世界書條目的 order:999 誤當 depth 填→depth:999(聊天最頂=注意力最低)=天天失憶。
            //      ⚠️ 但 injectPrompts depth:0 實測會讓大總結「整個不注入」(跟世界書 @depth:0 不同；疑與向量記憶那條 depth:0 撞掉)。
            //      → depth:1（緊貼生成點=高注意力、>0 才穩定注入）。localStorage sp_summary_inject_depth 自調(別設 0；太大坨被切就往上調 2/4)。
            let _depth = parseInt(localStorage.getItem('sp_summary_inject_depth'));
            if (isNaN(_depth) || _depth < 1) _depth = 1;
            const result = win.TavernHelper.injectPrompts([{
                id: INJECT_ID,
                content: block.trim(),
                position: 'in_chat',
                depth: _depth,
                role: 'system'
            }], { once: true });
            _lastUninject = result?.uninject || null;
            _lastInjected = { chatId, text: block.trim(), len: block.length };
            console.log(`📜 [Grand Summary Injector] 注入大總結壓縮版（chatId=${chatId}、${payload.length} 字、depth=${_depth}）`);
        } catch (e) {
            console.warn('[Grand Summary Injector] 失敗:', e?.message || e);
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectSummary(); });   // dryRun 空跑不注入(once 會被空跑吃掉)
        if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, () => {
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null; _cache.clear(); _lastInjected = null;
        });
        console.log('📜 [Grand Summary Injector] Ready（大總結程式注入，OS_DB→壓縮→injectPrompts）');
    }

    win.OS_SUMMARY_INJECT = {
        injectSummary,
        // 存檔/編輯大總結後呼叫 → 丟掉該 chat 的快取，下一輪重抓壓縮版
        invalidate(chatId) {
            try { if (chatId) _cache.delete(chatId); else _cache.clear(); }
            catch (e) { _cache.clear(); }
        },
        get _lastInjected() { return _lastInjected; },
    };
    init();
})();
