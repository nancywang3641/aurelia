// ----------------------------------------------------------------
// [檔案] vn_free_mode.js — VN「自由模式」（世界卡/純生成卡：[Char] 不寫表情格、省 token）
// 核心思路（Rae 拍板）：AI 是跟著上下文範例走的，小紙條式的覆蓋指令壓不過總綱＋歷史——
//   所以自由模式要讓 AI 看到的「規則＋歷史範例」整套自洽：
//   ① 總綱條目二選一（Rae 定案：兩條條目都是「她的」、腳本**只撥開關、絕不創建/寫入條目**）：
//      辨識＝名字同時含「VN」+「總綱」（縮寫如「VN總綱-自由版」、完整如「VN正文格式與TAG總綱」都吃）；
//      自由版＝再含「自由」，固定版＝不含「自由」（她自己維護）。自由版條目不存在 → 不切換、console 提示，絕不代寫。
//   ② 歷史對齊：一條 promptOnly 正則（跟著模式開關）把歷史裡的表情格從送 AI 的 prompt 剝掉。
//   ③ 引擎端表情格容錯常駐（vn_core._normCharParts），三欄四欄都吃。
// 模式按「storyId=這張卡」記（不是 chatId：同卡開新聊天該記得模式，不用重選）。
// 只在酒館環境生效（需 TavernHelper）；PWA 靜默不動。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // 總綱條目辨識：名字同時含「VN」與「總綱」即算總綱條目——容她的縮寫命名
    //   (如「VN總綱-自由版」「VN總綱-固定版」) 與完整命名 (如「VN正文格式與TAG總綱」)，兩種都吃。
    //   自由版=再含「自由」，固定版=不含「自由」。兩條都Rae自己維護、腳本只撥開關。
    const _isCoreName = (nm) => { nm = String(nm || ''); return nm.includes('VN') && nm.includes('總綱'); };
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
    // 實際跑的模式（世界書/正則要對齊的是這個，不是 isFree()）
    function _effectiveFree(id) { return isFree(id) || _inParallax(); }

    // 找「固定版總綱」所在的世界書與條目（掃全域已選＋角色主/附加）
    async function _findCoreEntry() {
        const th = _th();
        if (!th || !th.getWorldbook) return null;
        const books = new Set();
        try {
            const st = th.getLorebookSettings ? th.getLorebookSettings() : null;
            (st && st.selected_global_lorebooks || []).forEach(b => books.add(b));
        } catch (e) {}
        try {
            const cl = th.getCharLorebooks ? th.getCharLorebooks() : null;
            if (cl && cl.primary) books.add(cl.primary);
            (cl && cl.additional || []).forEach(b => books.add(b));
        } catch (e) {}
        for (const book of books) {
            if (!book) continue;
            try {
                const ents = await th.getWorldbook(book);
                const core = (ents || []).find(e => e && _isCoreName(e.name) && !String(e.name || '').includes('自由'));
                if (core) return { book, ents };
            } catch (e) {}
        }
        return null;
    }

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

    // 把世界書/正則調成當前卡該有的樣子（切模式、換卡、進出視差都走這；狀態沒變就不寫、避免磁碟空轉）
    // force=true → 略過記憶直接重算：換卡/開機用（也順便修她自己在世界書面板手撥過的燈）。
    // 獨立版：總綱條目住 OS_DB，用同一套名字判準撥開關。
    //   規矩跟酒館完全一樣 —— 兩條條目都是她的，腳本只撥 enabled、絕不創建也不寫內容。
    async function _applyStandalone(free) {
        const DB = win.OS_DB || window.OS_DB;
        if (!DB || !DB.getAllWorldbookEntries || !DB.saveWorldbookEntry) return;
        const all = (await DB.getAllWorldbookEntries()) || [];
        const cores = all.filter(e => _isCoreName(e && e.title));
        if (!cores.length) { console.log('[VN自由模式] 獨立版世界書裡沒有總綱條目 → 不動'); return; }
        const _isFreeEnt = (e) => String(e.title || '').includes('自由');
        if (free && !cores.some(_isFreeEnt)) {
            console.warn(`[VN自由模式] 獨立版世界書裡找不到自由版總綱條目（名字需含「${CORE_ENTRY_HINT}」+「自由」）→ 維持固定版、不切換`);
            return;
        }
        let changed = 0;
        for (const e of cores) {
            const want = _isFreeEnt(e) ? free : !free;
            if ((e.enabled !== false) === want) continue;
            await DB.saveWorldbookEntry({ ...e, enabled: want, updatedAt: Date.now() });
            changed++;
        }
        if (changed) console.log(`[VN自由模式] 獨立版世界書開關已切換 → ${free ? '自由版' : '固定版'}總綱（改了 ${changed} 條）`);
    }

    let _applying = false;
    let _lastEff = null;   // 上次真的套用完的實際模式；沒變就連世界書都不用讀（世界門每則訊息會戳這支一次）
    async function applyForCurrent(force) {
        if (_applying) return;
        const free = _effectiveFree();
        if (!force && _lastEff === free) return;
        _applying = true;
        try {
            // 獨立版沒有 TavernHelper：世界書走 OS_DB，歷史表情格的剝除由組 prompt 時做
            //   （PWA 不吃酒館正則，歷史是 os_api_engine 從章節組出來的）
            if (_isStandalone()) { await _applyStandalone(free); _lastEff = free; return; }

            const th = _th();
            if (!th) return;
            const hit = await _findCoreEntry();
            // 🚨這兩條「做不了」的出口也要記下來：世界門每則訊息會戳這支一次，不記＝每則訊息都把
            //   全部世界書重讀一遍＋刷一行 log。force（換卡/開機/她手動切）還是會重新檢查，
            //   所以中途補上條目不會永遠卡住。
            if (!hit) { _lastEff = free; console.log('[VN自由模式] 找不到總綱條目（這張卡可能不掛VN世界書）→ 不動'); return; }
            const { book, ents } = hit;
            const core = ents.find(e => _isCoreName(e.name) && !String(e.name || '').includes('自由'));
            const freeEnt = ents.find(e => { const nm = String(e.name || ''); return _isCoreName(nm) && nm.includes('自由'); });

            // 自由版條目是 Rae 自己維護的；不存在就不切換、絕不代寫（她明令：腳本不注入世界書）
            if (free && !freeEnt) {
                _lastEff = free;
                console.warn(`[VN自由模式] 「${book}」裡找不到自由版總綱條目（名字需含「${CORE_ENTRY_HINT}」+「自由」）→ 維持固定版、不切換`);
                return;
            }

            const coreOk = core.enabled === !free;
            const freeOk = free ? (freeEnt.enabled === true) : (!freeEnt || freeEnt.enabled === false);
            if (!(coreOk && freeOk)) {
                await th.updateWorldbookWith(book, (list) => {
                    for (const e of list) {
                        const nm = String(e.name || '');
                        if (!_isCoreName(nm)) continue;
                        e.enabled = nm.includes('自由') ? free : !free;   // 只撥開關，內容永遠是她的
                    }
                    return list;
                });
                console.log(`[VN自由模式] 世界書開關已切換 → ${free ? '自由版' : '固定版'}總綱（${book}）`);
            }
            await _setHistoryRegex(free);
            _lastEff = free;   // 世界書＋正則都對齊了才記；中途 return 的（找不到條目等）不記，下次還會再試
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

    // 換卡/換聊天 → 世界書狀態跟上這張卡的模式
    function _hook() {
        try {
            if (win.eventOn && win.tavern_events && win.tavern_events.CHAT_CHANGED) {
                win.eventOn(win.tavern_events.CHAT_CHANGED, () => { setTimeout(() => applyForCurrent(true), 800); });
            }
        } catch (e) {}
        setTimeout(() => applyForCurrent(true), 3000);   // 開機對齊一次
    }
    // 獨立版沒有 TavernHelper 也要掛：世界書那條路走 OS_DB，開機一樣要對齊一次
    //   （以前這行只在有 TavernHelper 時執行，所以 PWA 連對齊都不會發生）
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
