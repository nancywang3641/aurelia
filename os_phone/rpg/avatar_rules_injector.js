// ----------------------------------------------------------------
// [檔案] avatar_rules_injector.js (V3 — VN 指令開關)
// 路徑：os_phone/rpg/avatar_rules_injector.js
// 職責：頭像規則有三條，在 VN 指令（os_vn_rules_data.js）裡，依名字辨識：
//         [VN-POLLAI]  → Pollinations
//         [VN-NAI]     → NovelAI
//         [VN-COMFYUI] → 酒館原生(tavern_sd) 與 ComfyUI 直連(comfyui_direct)
//         [VN-CAPI]    → 自訂接口(custom_api)
//       依當前頭像產圖器，把對應那條打開、其餘兩條關掉。酒館與 PWA 同一條路。
// ⚠️ 邊界：只撥開關，不寫內容。
// 2026-09-14 以前撥的是酒館全域世界書「-VN小說家-」（PWA 撥自己的世界書），VN 指令搬進程式後改撥這份。
// ----------------------------------------------------------------
(function() {
    console.log('🪪 [Avatar Rules] V3 載入（VN 指令開關）');
    const win = window.parent || window;

    const CFG_KEY = 'os_image_config';

    // service → 應該打開的條目（其餘自動關掉）
    const SERVICE_TO_ENTRY = {
        pollinations:   '[VN-POLLAI]',
        novelai:        '[VN-NAI]',
        tavern_sd:      '[VN-COMFYUI]',
        comfyui_direct: '[VN-COMFYUI]',
        custom_api:     '[VN-CAPI]',
    };
    const ALL_ENTRY_TAGS = ['[VN-POLLAI]', '[VN-NAI]', '[VN-COMFYUI]', '[VN-CAPI]'];

    // 頭像規則要跟「頭像桶」走：設置→圖片→頭像那格是 serviceChar，
    // 舊「活物桶」serviceLiving、再舊的全域 service 依序當退路（同 OS_IMAGE_MANAGER.serviceFor('char')）。
    // ⚠️ 原本只讀全域 service → 頭像那格換了接口這裡看不到，規則會停在舊的那一條。
    function _currentService() {
        try {
            // 圖片設置 → 畫風「頭像」那列改過接口就跟它走（引擎還沒載好才讀存檔）
            const W = window.parent || window;
            const IM = W.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
            if (IM && typeof IM.serviceForUse === 'function') return IM.serviceForUse('avatar') || 'pollinations';
            const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {};
            return c.serviceChar || c.serviceLiving || c.service || 'pollinations';
        }
        catch (e) { return 'pollinations'; }
    }

    // 依當前產圖器：打開對應條目、關掉其餘兩條
    async function syncAvatarRuleEntries() {
        const VR = win.OS_VN_RULES || window.OS_VN_RULES;
        if (!VR || !VR.setEnabledByName) return;
        try {
            const service = _currentService();
            const wantTag = SERVICE_TO_ENTRY[service] || null;
            const r = VR.setEnabledByName(ALL_ENTRY_TAGS, wantTag ? [wantTag] : []);
            if (!r.seen.length) {
                console.warn('🪪 [Avatar Rules] ⛔ VN 指令裡找不到 [VN-POLLAI]/[VN-NAI]/[VN-COMFYUI]/[VN-CAPI] → 頭像規則沒有東西可切');
                return;
            }
            // 新接口沒在 SERVICE_TO_ENTRY 登記 → 四條全關，AI 只剩總綱那行可照，頭像只寫得出髮型服裝。加新來源必須同步這張表。
            if (!wantTag) console.warn(`🪪 [Avatar Rules] ⚠️ service=${service} 沒有對應的頭像規則條目 → 四條全關`);
            if (r.opened.length || r.closed.length) {
                console.log(`🪪 [Avatar Rules] ✅ service=${service} → 啟用 ${wantTag}、停用其餘（改了 ${r.opened.length + r.closed.length} 條）`);
            }
        } catch (e) {
            console.warn('🪪 [Avatar Rules] sync 失敗:', e?.message || e);
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) {
            setTimeout(init, 1000);
            return;
        }
        // 切聊天/角色時同步一次
        if (win.tavern_events.CHAT_CHANGED) {
            win.eventOn(win.tavern_events.CHAT_CHANGED, () => { syncAvatarRuleEntries(); });
        }
        // 載入後同步一次，讓開關對上目前選的產圖器
        syncAvatarRuleEntries();
        console.log('🪪 [Avatar Rules] Ready（VN 指令開關）');
    }

    // 對外：畫廊切產圖器、按「保存」後呼叫 → 立即同步開關
    win.OS_AVATAR_RULES_INJECTOR = {
        syncAvatarRuleEntries,
        sync: syncAvatarRuleEntries,
        SERVICE_TO_ENTRY,
    };

    init();
})();
