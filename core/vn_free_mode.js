// ----------------------------------------------------------------
// [檔案] vn_free_mode.js — VN「自由模式」（世界卡/純生成卡：[Char] 不寫表情格、省 token）
// 核心思路（Rae 拍板）：AI 是跟著上下文範例走的，小紙條式的覆蓋指令壓不過總綱＋歷史——
//   所以自由模式要讓 AI 看到的「規則＋歷史範例」整套自洽：
//   ① 總綱二選一：VN 指令（os_vn_rules，程式內建）裡的固定版／自由版總綱，腳本只撥開關。
//      辨識＝名字同時含「VN」+「總綱」；自由版＝再含「自由」，固定版＝不含「自由」。
//   ② 歷史對齊：酒館用一條 promptOnly 正則（跟著模式開關）把歷史裡的表情格從送 AI 的 prompt 剝掉；
//      PWA 的歷史是 os_api_engine 從章節拼的，由它呼叫 stripEmotionCol。
//   ③ 引擎端表情格容錯常駐（vn_core._normCharParts），三欄四欄都吃。
// 模式按「storyId=這張卡」記（不是 chatId：同卡開新聊天該記得模式，不用重選）。
// 2026-09-14 VN 指令從酒館全域世界書搬進程式，這支不再讀寫世界書。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // 總綱條目辨識：名字同時含「VN」與「總綱」即算總綱條目
    //   (如「VN總綱-自由版」與「VN正文格式與TAG總綱」)。自由版=再含「自由」。
    const _isCoreName = (nm) => { nm = String(nm || ''); return nm.includes('VN') && nm.includes('總綱'); };
    // 通話/手機條目（call 面板）也分固定版與自由版——call 裡的 [Char] 有沒有表情格得跟總綱同步，
    //   不然自由模式下 AI 看著固定版範例照樣寫表情格。
    //   跟總綱不同的是這組不是常駐必亮：配對的「總開關」（世界題材）尊重現況——
    //   兩條裡任一條亮著才算在用，腳本只負責挑「亮哪一版」；兩條都暗就整組不碰。
    const _isCallName = (nm) => String(nm || '').includes('通話與手機聊天');
    const CORE_ENTRY_HINT = 'VN…總綱';                 // 只用於 console 提示文字
    const RX_NAME = '[VN自由模式] 歷史表情格剝除';     // promptOnly 正則名

    function _th() { return win.TavernHelper || null; }
    function _isStandalone() {
        try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; }
    }

    // 這張卡的鑰匙：卡片層級（同卡不同聊天共用）
    //   獨立版沒有角色卡，對應物是「這本藏書」＝ vn_current_world_id（書架 dive 時寫入）。
    //   用 storyId 會每開一個新開場白就換一把 → 每次都要重選模式，那不是卡片層級。
    function _storyId() {
        try {
            const th = _th();
            const cd = th && th.getCharData ? th.getCharData('current') : null;
            if (cd && (cd.avatar || cd.name)) return String(cd.avatar || cd.name);
        } catch (e) {}
        if (_isStandalone()) {
            try { const w = localStorage.getItem('vn_current_world_id'); if (w) return String(w); } catch (e) {}
        }
        try { return localStorage.getItem('vn_current_story_id') || ''; } catch (e) { return ''; }
    }
    function _key(id) { return 'vn_free_mode_' + id; }

    // 🌌 人在視差世界裡 → 一律當自由模式。旅人是每趟隨機生成的、根本沒有表情圖庫，
    //   立繪本來就全走生成，還讓 AI 每句寫一格表情只是白燒 token（而且它會亂寫）。
    //   🚨這是「疊上去」不是「改掉她的設定」：localStorage 存的永遠是她在藏書手動選的那個，
    //   撤離回主世界就自動疊回去——大廳那些有圖庫的固定角色不會被世界門洗成純生成。
    function _inParallax() {
        try {
            const g = win.AURELIA_WORLDGATE || window.AURELIA_WORLDGATE;
            return !!(g && typeof g.isInParallax === 'function' && g.isInParallax());
        } catch (e) { return false; }
    }
    // 實際跑的模式（VN 指令/正則要對齊的是這個，不是 isFree()）
    function _effectiveFree(id) { return isFree(id) || _inParallax(); }

    // 歷史表情格剝除正則（promptOnly；表情格=純英文字才剝，三欄行不會誤傷台詞）
    // 🚨 鐵則：狀態沒變「絕不」呼叫 updateTavernRegexesWith——寫正則會讓酒館重載聊天(觸發CHAT_CHANGED)，
    //    無條件寫＝重載→CHAT_CHANGED→再寫→無限刷頁卡死（2026-07-09 事故）。讀現況+本地快取雙保險。
    let _rxState = null;
    async function _setHistoryRegex(on) {
        const th = _th();
        if (!th || !th.updateTavernRegexesWith) return;
        if (_rxState === on) return;                       // 本頁已套用過同狀態 → 免談
        try {
            if (th.getTavernRegexes) {
                const cur = th.getTavernRegexes() || [];
                const has = cur.some(r => r && r.script_name === RX_NAME && r.enabled !== false);
                if (has === on) { _rxState = on; return; }  // 現況已正確 → 不寫
            }
        } catch (e) {}
        _rxState = on;
        await th.updateTavernRegexesWith(rx => {
            const out = (rx || []).filter(r => r && r.script_name !== RX_NAME);
            if (on) out.push({
                id: th.uuidv4 ? th.uuidv4() : ('vn_free_rx_' + Math.random().toString(36).slice(2)),
                script_name: RX_NAME,
                enabled: true,
                find_regex: '/\\[Char\\|([^|\\]]+)\\|\\s*[A-Za-z]+\\s*\\|/g',
                replace_string: '[Char|$1|',
                trim_strings: [],
                source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
                destination: { display: false, prompt: true },
                run_on_edit: false,
                min_depth: null, max_depth: null,
                markdownOnly: false, promptOnly: true, substituteRegex: 0
            });
            return out;
        }, { type: 'global' });
    }

    // 撥 VN 指令的總綱與通話那組。回 false＝做不了（缺自由版總綱），呼叫端就不動歷史表情格正則。
    function _applyRules(VR, free) {
        const all = VR.list();
        const cores = all.filter(e => _isCoreName(e && e.name));
        if (!cores.length) { console.warn('[VN自由模式] VN 指令裡沒有總綱條目 → 不動'); return false; }
        if (free && !cores.some(e => String(e.name || '').includes('自由'))) {
            console.warn(`[VN自由模式] VN 指令裡找不到自由版總綱（名字需含「${CORE_ENTRY_HINT}」+「自由」）→ 維持固定版、不切換`);
            return false;
        }
        const calls = all.filter(e => _isCallName(e && e.name));
        const callOn = calls.length >= 2 && calls.some(e => e.enabled !== false);
        const r = VR.apply(e => {
            const nm = String(e.name || '');
            if (_isCoreName(nm)) return nm.includes('自由') ? free : !free;
            if (calls.length >= 2 && _isCallName(nm)) return callOn && (nm.includes('自由') === free);
            return undefined;
        });
        if (r.opened.length || r.closed.length) console.log(`[VN自由模式] VN 指令開關已切換 → ${free ? '自由版' : '固定版'}（改了 ${r.opened.length + r.closed.length} 條）`);
        return true;
    }

    // 把 VN 指令／正則調成當前卡該有的樣子（切模式、換卡、進出視差都走這；狀態沒變就不寫）
    // force=true → 略過記憶直接重算：換卡/開機用。
    let _applying = false;
    let _lastEff = null;   // 上次真的套用完的實際模式；沒變就不用再算（世界門每則訊息會戳這支一次）
    async function applyForCurrent(force) {
        if (_applying) return;
        const free = _effectiveFree();
        if (!force && _lastEff === free) return;
        const VR = win.OS_VN_RULES || window.OS_VN_RULES;
        if (!VR || !VR.apply) return;   // 開機早期還沒載入：不記 _lastEff，下次再來
        _applying = true;
        try {
            const ok = _applyRules(VR, free);
            if (ok && !_isStandalone()) await _setHistoryRegex(free);
            _lastEff = free;
        } catch (e) {
            console.warn('[VN自由模式] 套用失敗:', e);
        } finally { _applying = false; }
    }

    function isFree(id) {
        try { return localStorage.getItem(_key(id || _storyId())) === '1'; } catch (e) { return false; }
    }
    // id 可省略＝設「現在這張卡/這本書」。書架在踏入之前就要先選模式，那時 vn_current_world_id
    //   還是上一本 → 由呼叫端把那本書的 id 傳進來，只寫檔；等 dive 把它設成當前再套用。
    async function set(on, id) {
        const cur = _storyId();
        const target = id || cur;
        if (!target) { console.warn('[VN自由模式] 拿不到當前卡片，略過'); return false; }
        try { localStorage.setItem(_key(target), on ? '1' : '0'); } catch (e) {}
        if (target === cur) await applyForCurrent(true);
        return true;
    }

    // 換卡/換聊天 → VN 指令開關跟上這張卡的模式
    function _hook() {
        try {
            if (win.eventOn && win.tavern_events && win.tavern_events.CHAT_CHANGED) {
                win.eventOn(win.tavern_events.CHAT_CHANGED, () => { setTimeout(() => applyForCurrent(true), 800); });
            }
        } catch (e) {}
        setTimeout(() => applyForCurrent(true), 3000);   // 開機對齊一次
    }
    if (_th() || _isStandalone()) _hook();
    else setTimeout(() => { if (_th() || _isStandalone()) _hook(); }, 5000);

    // 歷史對齊（獨立版）：酒館用 promptOnly 正則把歷史裡的表情格剝掉，PWA 的歷史是組 prompt 時
    //   從章節拼出來的 → 由 os_api_engine 呼叫這支，正則只留這一份。
    function stripEmotionCol(text) {
        return String(text == null ? '' : text)
            .replace(/\[Char\|([^|\]]+)\|\s*[A-Za-z]+\s*\|/g, '[Char|$1|');
    }

    win.VN_FREE_MODE = { isFree, set, applyForCurrent, storyId: _storyId, inParallax: _inParallax, effectiveFree: _effectiveFree, stripEmotionCol };
    window.VN_FREE_MODE = win.VN_FREE_MODE;
    console.log('🎲 [VN自由模式] 模組就緒');
})();
