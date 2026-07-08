// ----------------------------------------------------------------
// [檔案] vn_free_mode.js — VN「自由模式」（世界卡/純生成卡：[Char] 不寫表情格、省 token）
// 核心思路（Rae 拍板）：AI 是跟著上下文範例走的，小紙條式的覆蓋指令壓不過總綱＋歷史——
//   所以自由模式要讓 AI 看到的「規則＋歷史範例」整套自洽：
//   ① 總綱條目二選一（Rae 定案：條目是「她的」、腳本只撥開關）：
//      固定版＝她手寫的「🟦核心｜VN正文格式與TAG總綱」；
//      自由版＝第一次切換時從固定版推導「生成一次」放進世界書，之後**永不覆蓋內容**——
//      她可以自由手調自由版措辭；改了總綱想同步，把兩條丟給大丹對齊。
//   ② 歷史對齊：一條 promptOnly 正則（跟著模式開關）把歷史裡的表情格從送 AI 的 prompt 剝掉。
//   ③ 引擎端表情格容錯常駐（vn_core._normCharParts），三欄四欄都吃。
// 模式按「storyId=這張卡」記（不是 chatId：同卡開新聊天該記得模式，不用重選）。
// 只在酒館環境生效（需 TavernHelper）；PWA 靜默不動。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const CORE_ENTRY_MATCH = 'VN正文格式與TAG總綱';                 // 固定版條目名（含這串、且不含「自由」）
    const FREE_ENTRY_NAME = '🟦核心｜VN總綱-自由版(腳本自動開關)';   // 自由版條目名（腳本產生與維護）
    const RX_NAME = '[VN自由模式] 歷史表情格剝除';                   // promptOnly 正則名

    function _th() { return win.TavernHelper || null; }

    // 這張卡的鑰匙：卡片層級（同卡不同聊天共用）
    function _storyId() {
        try {
            const th = _th();
            const cd = th && th.getCharData ? th.getCharData('current') : null;
            if (cd && (cd.avatar || cd.name)) return String(cd.avatar || cd.name);
        } catch (e) {}
        try { return localStorage.getItem('vn_current_story_id') || ''; } catch (e) { return ''; }
    }
    function _key(id) { return 'vn_free_mode_' + id; }

    // ── 自由版總綱推導（機械轉換，改總綱自動跟上）──
    function _deriveFreeContent(src) {
        let s = String(src || '');
        // 1) [Char|名|表情|... → [Char|名|...（兩種寫法都吃：真表情詞=純英文字、模板佔位=中文「表情」二字）
        s = s.replace(/\[Char\|([^|\[\]]+)\|\s*[A-Za-z]+\s*\|/g, '[Char|$1|');
        s = s.replace(/\[Char\|([^|\[\]]+)\|表情\|/g, '[Char|$1|');
        // 2) 欄位序號跟著位移
        s = s.replace(/\[Char\]\s*第五欄/g, '[Char] 第四欄').replace(/第五欄必為/g, '第四欄必為');
        // 3) 表情清單保留給 [Achievement] 用、明示 [Char] 不含表情格
        s = s.replace(/^- 表情：/m, '- 表情清單（本卡僅 [Achievement] 的表情欄使用，[Char] 一律不含表情格）：');
        // 4) 開頭插模式聲明
        s = s.replace(/^(#[^\n]*\n)/, '$1（🎲 本卡為自由模式：[Char] 不寫表情格，格式一律為 [Char|角色名|「台詞」|Stay/Leave]）\n');
        return s;
    }

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
                const core = (ents || []).find(e => e && String(e.name || '').includes(CORE_ENTRY_MATCH) && !String(e.name || '').includes('自由'));
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

    // 把世界書/正則調成當前卡該有的樣子（切模式、換卡都走這；狀態沒變就不寫、避免磁碟空轉）
    let _applying = false;
    async function applyForCurrent() {
        if (_applying) return;
        _applying = true;
        try {
            const th = _th();
            if (!th) return;
            const free = isFree();
            const hit = await _findCoreEntry();
            if (!hit) { console.log('[VN自由模式] 找不到總綱條目（這張卡可能不掛VN世界書）→ 不動'); return; }
            const { book, ents } = hit;
            const core = ents.find(e => String(e.name || '').includes(CORE_ENTRY_MATCH) && !String(e.name || '').includes('自由'));
            const freeEnt = ents.find(e => String(e.name || '') === FREE_ENTRY_NAME);

            // 自由版條目不存在 → 第一次（也是唯一一次）從總綱推導生成；之後它是「她的條目」，內容永不覆蓋
            if (free && !freeEnt && th.createWorldbookEntries) {
                await th.createWorldbookEntries(book, [{
                    name: FREE_ENTRY_NAME, enabled: true, content: _deriveFreeContent(core.content),
                    strategy: core.strategy || { type: 'constant' },
                    position: core.position || undefined
                }]);
                console.log(`[VN自由模式] 首次啟用 → 已在「${book}」生成自由版總綱條目（之後只撥開關、不再動它的內容）`);
            }

            const coreOk = core.enabled === !free;
            const freeOk = free ? (freeEnt ? freeEnt.enabled === true : true) : (!freeEnt || freeEnt.enabled === false);
            if (!(coreOk && freeOk)) {
                await th.updateWorldbookWith(book, (list) => {
                    for (const e of list) {
                        const nm = String(e.name || '');
                        if (nm.includes(CORE_ENTRY_MATCH) && !nm.includes('自由')) e.enabled = !free;
                        else if (nm === FREE_ENTRY_NAME) e.enabled = free;   // 只撥開關，內容是她的
                    }
                    return list;
                });
                console.log(`[VN自由模式] 世界書開關已切換 → ${free ? '自由版' : '固定版'}總綱（${book}）`);
            }
            await _setHistoryRegex(free);
        } catch (e) {
            console.warn('[VN自由模式] 套用失敗:', e);
        } finally { _applying = false; }
    }

    function isFree(id) {
        try { return localStorage.getItem(_key(id || _storyId())) === '1'; } catch (e) { return false; }
    }
    async function set(on) {
        const id = _storyId();
        if (!id) { console.warn('[VN自由模式] 拿不到當前卡片，略過'); return false; }
        try { localStorage.setItem(_key(id), on ? '1' : '0'); } catch (e) {}
        await applyForCurrent();
        return true;
    }

    // 換卡/換聊天 → 世界書狀態跟上這張卡的模式
    function _hook() {
        try {
            if (win.eventOn && win.tavern_events && win.tavern_events.CHAT_CHANGED) {
                win.eventOn(win.tavern_events.CHAT_CHANGED, () => { setTimeout(applyForCurrent, 800); });
            }
        } catch (e) {}
        setTimeout(applyForCurrent, 3000);   // 開機對齊一次
    }
    if (_th()) _hook(); else setTimeout(() => { if (_th()) _hook(); }, 5000);

    win.VN_FREE_MODE = { isFree, set, applyForCurrent, storyId: _storyId, _deriveFreeContent };
    window.VN_FREE_MODE = win.VN_FREE_MODE;
    console.log('🎲 [VN自由模式] 模組就緒');
})();
