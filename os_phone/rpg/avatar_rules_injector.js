// ----------------------------------------------------------------
// [檔案] avatar_rules_injector.js (V2 — 世界書條目開關模式)
// 路徑：os_phone/rpg/avatar_rules_injector.js
// 職責：頭像規則的「內容」由使用者自己維護在世界書「-VN小說家-」的三個條目裡
//       （依【名字 comment】辨識，不靠 UID、不靠 keyword）：
//         [VN-POLLAI]  → Pollinations
//         [VN-NAI]     → NovelAI
//         [VN-COMFYUI] → 酒館原生(tavern_sd) 與 ComfyUI 直連(comfyui_direct)
//       本檔只做一件事：依當前頭像產圖器，把對應那條「啟用」、其餘兩條「停用」，
//       省掉每次換產圖器要手動去世界書開開關關。
//
// ⚠️ 邊界：只改條目的 enabled 開關，不寫內容、不碰角色卡、不動 UID/keyword。
// 只做酒館版（靠 TavernHelper 世界書 API）。
// ----------------------------------------------------------------
(function() {
    console.log('🪪 [Avatar Rules] V2 載入（世界書條目開關模式）');
    const win = window.parent || window;

    const CFG_KEY = 'os_image_config';
    const BOOK = '-VN小說家-';

    // service → 應該「啟用」的世界書條目名字（其餘自動停用）
    const SERVICE_TO_ENTRY = {
        pollinations:   '[VN-POLLAI]',
        novelai:        '[VN-NAI]',
        tavern_sd:      '[VN-COMFYUI]',
        comfyui_direct: '[VN-COMFYUI]',
    };
    const ALL_ENTRY_TAGS = ['[VN-POLLAI]', '[VN-NAI]', '[VN-COMFYUI]'];

    function _currentService() {
        try { return (JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}).service || 'pollinations'; }
        catch (e) { return 'pollinations'; }
    }

    let _syncing = false;

    // 依當前產圖器：啟用對應條目、停用其餘兩條（找「名字」、只改 enabled）
    async function syncAvatarRuleEntries() {
        if (_syncing) return;
        _syncing = true;
        try {
            const TH = win.TavernHelper;
            if (!TH?.getLorebookEntries || !TH?.setLorebookEntries) {
                console.warn('🪪 [Avatar Rules] ⛔ TavernHelper 世界書 API 不可用 → 跳過');
                return;
            }

            const service = _currentService();
            const wantTag = SERVICE_TO_ENTRY[service] || null;

            let entries;
            try {
                entries = await TH.getLorebookEntries(BOOK);
            } catch (e) {
                console.warn(`🪪 [Avatar Rules] ⛔ 讀不到世界書「${BOOK}」→ 跳過（請先建好這本、放三條目）`);
                return;
            }
            if (!Array.isArray(entries) || !entries.length) {
                console.warn(`🪪 [Avatar Rules] ⛔ 世界書「${BOOK}」沒有條目 → 跳過`);
                return;
            }

            const updates = [];
            const seen = [];
            for (const e of entries) {
                const cm = String(e?.comment || '');
                const tag = ALL_ENTRY_TAGS.find(t => cm.includes(t));   // 用名字比對
                if (!tag) continue;                                     // 不是這三條，完全不碰
                seen.push(tag);
                const shouldEnable = (tag === wantTag);
                if (e.enabled !== shouldEnable) updates.push({ uid: e.uid, enabled: shouldEnable });
            }

            if (!seen.length) {
                console.warn(`🪪 [Avatar Rules] ⛔ 「${BOOK}」裡找不到 [VN-POLLAI]/[VN-NAI]/[VN-COMFYUI] 任何一條（比對名字 comment）`);
                return;
            }
            if (!updates.length) {
                console.log(`🪪 [Avatar Rules] service=${service} → 該開 ${wantTag}，狀態本來就對、無需變更`);
                return;
            }

            await TH.setLorebookEntries(BOOK, updates);
            console.log(`🪪 [Avatar Rules] ✅ service=${service} → 啟用 ${wantTag}、停用其餘（改了 ${updates.length} 條開關）`);
        } catch (e) {
            console.warn('🪪 [Avatar Rules] sync 失敗:', e?.message || e);
        } finally {
            _syncing = false;
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) {
            setTimeout(init, 1000);
            return;
        }
        // 切聊天/角色時同步一次（世界書狀態可能變）
        if (win.tavern_events.CHAT_CHANGED) {
            win.eventOn(win.tavern_events.CHAT_CHANGED, () => { syncAvatarRuleEntries(); });
        }
        // 載入後同步一次，讓條目開關對上目前選的產圖器
        syncAvatarRuleEntries();
        console.log('🪪 [Avatar Rules] Ready（世界書條目開關模式）');
    }

    // 對外：畫廊切產圖器、按「保存」後呼叫 → 立即同步開關
    win.OS_AVATAR_RULES_INJECTOR = {
        syncAvatarRuleEntries,
        sync: syncAvatarRuleEntries,
        BOOK, SERVICE_TO_ENTRY,
    };

    init();
})();
