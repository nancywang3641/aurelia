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

            // ── 注入位置（2026-07-03 改制）─────────────────────────────────────
            // 舊制 in_chat depth:1 排在 VN 規範牆(depth:0)後面 → 大總結被壓在牆後、模型總是不讀。
            // 新制預設「跟 preset 並排」：走 ST 原生 setExtensionPrompt(IN_PROMPT)。
            //   已對過本機酒館原始碼：openai.js populateChatCompletion 對第三方擴展 prompt
            //   (position=IN_PROMPT) 走 injectToMain → 直接插在 preset『主提示(main)』正後方
            //   ＝頂部系統區、與 preset 條目並排，和破甲/寫作規則同一塊被讀。
            //   role=system；每輪 GENERATION_STARTED 重設、GENERATION_ENDED 清掉(仿 once，
            //   免殘值漏進大總結自己的 generateRaw)。
            // 逃生口：localStorage sp_summary_inject_pos='chat' 回舊制 in_chat(depth 用 sp_summary_inject_depth)。
            const _mode = localStorage.getItem('sp_summary_inject_pos') || 'preset';
            const _ctx = (() => { try { return win.SillyTavern?.getContext?.() || null; } catch (e) { return null; } })();
            if (_mode !== 'chat' && _ctx?.setExtensionPrompt) {
                _ctx.setExtensionPrompt(INJECT_ID, block.trim(), 0 /*IN_PROMPT(對過script.js:484)*/, 0, false, 0 /*system*/);
                _lastUninject = () => { try { _ctx.setExtensionPrompt(INJECT_ID, '', 0, 0, false, 0); } catch (e) {} };
                _lastInjected = { chatId, text: block.trim(), len: block.length, pos: 'preset並排(IN_PROMPT·主提示後)' };
                console.log(`📜 [Grand Summary Injector] 注入大總結壓縮版（chatId=${chatId}、${payload.length} 字、位置=preset並排·主提示後）`);
            } else {
                // 舊制 in_chat：數字越小越貼最新訊息。depth:1=排在 VN組件規範(depth:0)之後。
                //   🐛 修正史：舊 session 把 order:999 誤當 depth 填→depth:999=天天失憶；
                //      「depth:0 不注入」傳言已證偽，真凶是 _payloadFor 空快取卡死(2487ba6)。
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
                _lastInjected = { chatId, text: block.trim(), len: block.length, pos: 'in_chat depth=' + _depth };
                console.log(`📜 [Grand Summary Injector] 注入大總結壓縮版（chatId=${chatId}、${payload.length} 字、depth=${_depth}）`);
            }
        } catch (e) {
            console.warn('[Grand Summary Injector] 失敗:', e?.message || e);
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectSummary(); });   // dryRun 空跑不注入(once 會被空跑吃掉)
        // preset 並排制的 setExtensionPrompt 是持久值 → 生成一結束就清(仿 once)，
        // 免得殘值被後續的大總結 generateRaw / 其他工具生成一起吃進去
        const _clearAfterGen = () => { try { _lastUninject?.(); } catch (e) {} _lastUninject = null; };
        if (win.tavern_events.GENERATION_ENDED) win.eventOn(win.tavern_events.GENERATION_ENDED, _clearAfterGen);
        if (win.tavern_events.GENERATION_STOPPED) win.eventOn(win.tavern_events.GENERATION_STOPPED, _clearAfterGen);
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
