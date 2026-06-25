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

    function _chatId() {
        try { return win.OS_STORY_TOOLS?.getChatId?.() || ''; } catch (e) { return ''; }
    }

    async function _payloadFor(chatId) {
        if (_cache.has(chatId)) return _cache.get(chatId);
        let payload = '';
        try { payload = (await win.OS_STORY_TOOLS?.getCurrentInjectionPayload?.()) || ''; } catch (e) { payload = ''; }
        _cache.set(chatId, payload);   // 連 '' 也快取：summary-less 的聊天不會每輪重打世界書
        return payload;
    }

    async function injectSummary() {
        try {
            // 撤上次（避免疊加 / 切 chat 殘留）
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;
            _lastInjected = null;

            // 正在跑大總結（os_story_tools 的 generateRaw）→ 別把大總結摻進總結 prompt
            if (win.__AURELIA_SUMMARIZING) return;
            // 只在酒館跑；PWA 走 buildContext，不重複
            if (win.OS_API?.isStandalone?.()) return;
            if (!win.TavernHelper?.injectPrompts) return;
            if (!win.OS_STORY_TOOLS?.getCurrentInjectionPayload) return;

            const chatId = _chatId();
            if (!chatId) return;

            const payload = await _payloadFor(chatId);
            if (!payload) return;   // 這個聊天室還沒大總結

            const block =
                `<劇情總結 規則="既成事實·寫作前必讀·不得矛盾">\n` +
                `下列是本劇「至今為止」的劇情總結（結語＝整體走向總記憶；事件表＝至今完整劇情線，久遠已壓成階段節點、最近逐筆；物品表只列當前持有）。` +
                `你必須延續這些事實、保持前後連貫，嚴禁遺忘、改寫或與之矛盾。\n\n` +
                payload +
                `\n</劇情總結>`;

            // 注入深度(in_chat)：數字越小越貼最新訊息＝模型注意力越高；越大越往聊天頂＝注意力越低。
            //   ⚠️ 原本預設 999(聊天最頂)＝模型最不看的位置 → 大總結再完整也被忽略 = 天天失憶(Rae 實測手帕事件就在角色表卻被忘)。
            //   改預設 2(高注意力區、緊貼生成點，只讓最新一兩則訊息更貼)；要更近設 0/1、嫌擠掉近期對話可調高。localStorage sp_summary_inject_depth 自調。
            let _depth = parseInt(localStorage.getItem('sp_summary_inject_depth'));
            if (isNaN(_depth) || _depth < 0) _depth = 2;
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
