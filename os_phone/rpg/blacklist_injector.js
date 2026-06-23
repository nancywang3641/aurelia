// ----------------------------------------------------------------
// [檔案] blacklist_injector.js (V1)
// 路徑：os_phone/rpg/blacklist_injector.js
// 職責：每輪主模型生成前，把當前 chatId 對應的黑名單條目
//       用 injectPrompts({once:true}) 注入 system prompt，
//       避免世界書條目因 keys 觸發機制（要對話提到名字才激活）
//       而漏掉，導致 AI 忘記黑名單。
//
// 儲存層不動：黑名單仍由 status_panel 寫世界書條目
//   `[當前永不出現名單-黑名單角色] - <chatId>`
// 本檔只負責「讀條目 → 每輪 inject」。
// ----------------------------------------------------------------
(function() {
    console.log('🚫 [Blacklist Injector] V1 載入');
    const win = window.parent || window;

    const INJECT_ID = 'aurelia_blacklist';
    let _lastUninject = null;

    function normalizeChatId(raw) {
        if (!raw) return '';
        let s = String(raw).split(/[\\/]/).pop() || '';
        s = s.replace(/\.jsonl?$/i, '');
        return s.trim();
    }

    function getChatId() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            return normalizeChatId(ctx?.chatId);
        } catch(e) { return ''; }
    }

    async function getBlacklistContent() {
        try {
            if (!win.TavernHelper?.getLorebookEntries) return '';
            const bookName = win.TavernHelper.getCurrentCharPrimaryLorebook?.()
                || win.TavernHelper.getCharWorldbookNames?.('current')?.primary
                || '';
            if (!bookName) return '';
            const chatId = getChatId();
            if (!chatId) return '';

            const targetComment = `[當前永不出現名單-黑名單角色] - ${chatId}`;
            const entries = await win.TavernHelper.getLorebookEntries(bookName);
            const entry = entries.find(e => e.comment === targetComment);
            if (!entry) return '';
            // 兼容 enabled 欄位可能是 false / 0 / undefined
            if (entry.enabled === false) return '';
            const content = (entry.content || '').trim();
            return content || '';
        } catch(e) {
            console.warn('[Blacklist Injector] 讀世界書失敗:', e?.message || e);
            return '';
        }
    }

    async function injectBlacklist() {
        try {
            // 撤上次的（避免疊加 / 切 chat 後殘留）
            try { _lastUninject?.(); } catch(e) {}
            _lastUninject = null;

            if (!win.TavernHelper?.injectPrompts) return;
            const content = await getBlacklistContent();
            if (!content) return;

            const finalContent = `[黑名單 / 永不出現名單]\n${content}\n\n[嚴格規則] 上述名單中的角色禁止出現於本輪劇情、不可被提及、不可被互動，視為「不存在」。`;

            const result = win.TavernHelper.injectPrompts([{
                id: INJECT_ID,
                content: finalContent,
                position: 'in_chat',
                depth: 1,
                role: 'system'
            }], { once: true });
            _lastUninject = result?.uninject || null;
        } catch(e) {
            console.warn('[Blacklist Injector] inject 失敗:', e?.message || e);
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) {
            setTimeout(init, 1000);
            return;
        }
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectBlacklist(); });   // dryRun 空跑不注入
        }
        if (win.tavern_events.CHAT_CHANGED) {
            win.eventOn(win.tavern_events.CHAT_CHANGED, () => {
                try { _lastUninject?.(); _lastUninject = null; } catch(e) {}
            });
        }
        console.log('🚫 [Blacklist Injector] Ready');
    }

    // 對外：讓 panel 在加 / 刪黑名單後可以馬上 reinject（不必等下一輪 GENERATION_STARTED）
    win.OS_BLACKLIST_INJECTOR = { injectBlacklist };

    init();
})();
