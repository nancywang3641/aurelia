/**
 * os_card_regex.js — 角色卡自帶正則（美化面板）庫  v1
 *
 * 為什麼要有這支：
 *   酒館角色卡把「美化面板」放在 extensions.regex_scripts：找一段標記（如 <标题栏>…</标题栏>）
 *   → 換成一整份 HTML。VN 早就有「抓正則 → 渲染卡片」那條路（VN_Core._grabRegexCardHtml），
 *   但它只問 TavernHelper —— PWA 沒有酒館 → 問不到 → 卡片自帶的美化面板全部變成裸文字。
 *   這支就是 PWA 這邊的正則來源：匯入角色卡時把 regex_scripts 收下來，播放／預覽時交回去。
 *
 * 存哪裡：IndexedDB 的 app_data（OS_DB.saveAppData，appId=aurelia_card_regex／scope=global／key=worldId）
 *   - 不動 OS_DB schema（升版加 store 會 deadlock 全站）
 *   - 不進 localStorage（一張卡的正則動輒 100KB 起跳，撞 5MB 之後所有寫入靜默失敗）
 *   - 不會被 deleteAllByChatId 掃掉（那支只清 '::chat:<id>::' 那些 scope）
 *
 * 形狀：一律轉成 TavernHelper 的 TavernRegex 形狀存放 —— VN 那條路吃的就是這個形狀，
 *       同形才能直接接上去，不必為了 PWA 再寫一套判斷。
 *
 * 暴露：window.OS_CARD_REGEX
 */
(function () {
    'use strict';
    const win = window.parent || window;
    const APP_ID = 'aurelia_card_regex';

    let _packs = null;          // worldId → pack；null＝還沒讀過
    let _loading = null;        // 讀取中的 promise（併發只讀一次）

    // ── 酒館原生正則欄位 → TavernHelper 形狀（同 core/aurelia_api.js 的 _st2thRegex）──
    //   那支掛在酒館橋上，PWA 根本不會載到；這裡自己留一份，PWA 不依賴酒館橋。
    function _st2th(r) {
        const p = Array.isArray(r.placement) ? r.placement : [];
        return {
            id: r.id, script_name: r.scriptName, enabled: !r.disabled,
            find_regex: r.findRegex, replace_string: r.replaceString, trim_strings: r.trimStrings,
            source: { user_input: p.indexOf(1) >= 0, ai_output: p.indexOf(2) >= 0, slash_command: p.indexOf(3) >= 0, world_info: p.indexOf(5) >= 0 },
            destination: { display: !r.promptOnly, prompt: !r.markdownOnly },
            run_on_edit: r.runOnEdit, min_depth: r.minDepth, max_depth: r.maxDepth
        };
    }

    // "/pattern/flags" → RegExp（酒館 find_regex 就是這個格式；不是這格式就整串當 pattern）
    //   g 旗標留著：批量替換那條路要靠它一次換完；單顆卡片比對前會自己重置 lastIndex。
    function _toRegExp(str, keepGlobal) {
        if (!str) return null;
        try {
            const m = String(str).match(/^\/([\s\S]*)\/([a-z]*)$/i);
            if (m) {
                let f = (m[2] || '');
                if (!keepGlobal) f = f.replace(/g/g, '');
                return new RegExp(m[1], f);
            }
            return new RegExp(str, keepGlobal ? 'gi' : 'i');
        } catch (e) { return null; }
    }

    // 「卡片型」＝取代內容裡有版面級標籤（整份文件／div／table／style…），也就是「要彈出來的一張面板」。
    //   不能只看有沒有 '<' —— 卡片常帶著像 </rednote>\n<rednote> 這種純粹整理文字的規則，
    //   那些長得也像標籤，但吐出來的是要繼續當正文讀的東西，被當成面板就會憑空彈一張空卡。
    const _LAYOUT_TAG = /<(?:!DOCTYPE|html|body|style|div|section|article|main|table|iframe|figure|ul|ol|h[1-6]|p)[\s>\/]/i;
    function _isCardType(rs) { return _LAYOUT_TAG.test(String(rs || '')); }

    // 展開取代字串裡的 $ 佔位：$1…$99 捕獲組、$& 與 $0 整段命中、$$ 錢字號本身。
    //   🚨 $0 一定要自己處理：JS 原生 replace 不認 $0（會原樣留字），但酒館認、卡片作者也照用 ——
    //      直接把 replace_string 丟給原生 replace，那些卡的面板裡就會出現一個裸的 "$0"。
    function _expand(replaceString, args) {
        const whole = args[0];
        const groups = args.length - 2;   // 扣掉 offset 與原字串
        return String(replaceString || '').replace(/\$(\$|&|\d{1,2})/g, function (m0, g) {
            if (g === '$') return '$';
            if (g === '&' || g === '0') return whole;
            const i = parseInt(g, 10);
            if (i >= 1 && i < groups) { const v = args[i]; return (v == null) ? '' : v; }
            return m0;
        });
    }

    function _cleanCard(html) {
        return String(html).replace(/^\s*```html\s*/i, '').replace(/```\s*$/, '').trim();
    }
    function _isFullDoc(html) { return /<!DOCTYPE|<html[\s>]|<body[\s>]/i.test(html); }

    // 整份 HTML 文件 → iframe（內嵌 <script>／外部字體要在自己的文件裡才跑得動，同酒館做法）
    function _wrapCard(html) {
        const c = _cleanCard(html);
        if (!_isFullDoc(c)) return c;
        return '<iframe class="vn-regex-card" scrolling="no" srcdoc="' +
            c.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>';
    }

    // ── 讀寫 ────────────────────────────────────────────────────
    async function _load() {
        if (_packs) return _packs;
        if (_loading) return _loading;
        _loading = (async () => {
            const out = {};
            try {
                const rows = (win.OS_DB && win.OS_DB.getAppDataByApp)
                    ? await win.OS_DB.getAppDataByApp(APP_ID) : [];
                (rows || []).forEach(r => {
                    const v = r && r.value;
                    if (v && v.worldId) out[v.worldId] = v;
                });
            } catch (e) { console.warn('[卡片正則] 讀取正則庫失敗', e); }
            _packs = out;
            _loading = null;
            return _packs;
        })();
        return _loading;
    }

    // 從原始卡片 JSON 抽正則存成一包。回存下來的條數（0＝這張卡沒帶正則）。
    async function saveFromCard(worldId, cardName, rawCard) {
        if (!worldId || !rawCard) return 0;
        const d = rawCard.data || rawCard;
        const raw = (d.extensions && d.extensions.regex_scripts) || [];
        if (!Array.isArray(raw) || !raw.length) return 0;
        const pack = {
            worldId: worldId,
            cardName: cardName || '',
            enabled: true,
            importedAt: Date.now(),
            scripts: raw.map(_st2th).filter(s => s && s.find_regex)
        };
        if (!pack.scripts.length) return 0;
        try {
            await win.OS_DB.saveAppData(APP_ID, worldId, pack);
        } catch (e) { console.warn('[卡片正則] 存不下來', e); return 0; }
        if (!_packs) _packs = {};
        _packs[worldId] = pack;
        console.log('[卡片正則] 《' + (cardName || worldId) + '》收下 ' + pack.scripts.length + ' 條自帶正則');
        return pack.scripts.length;
    }

    async function listPacks() { const p = await _load(); return Object.keys(p).map(k => p[k]); }
    async function getPack(worldId) { const p = await _load(); return (worldId && p[worldId]) || null; }

    async function setEnabled(worldId, on) {
        const pack = await getPack(worldId);
        if (!pack) return false;
        pack.enabled = !!on;
        try { await win.OS_DB.saveAppData(APP_ID, worldId, pack); } catch (e) { return false; }
        return true;
    }
    async function removePack(worldId) {
        const p = await _load();
        if (!worldId) return false;
        try { await win.OS_DB.saveAppData(APP_ID, worldId, { worldId: worldId, cardName: '', enabled: false, scripts: [] }); }
        catch (e) { return false; }
        delete p[worldId];
        return true;
    }

    function currentWorldId() {
        try { return localStorage.getItem('vn_current_world_id') || ''; } catch (e) { return ''; }
    }

    // ── 取用（同步）─────────────────────────────────────────────
    // VN 播放中間不能 await（loadScript→next() 是同步契約），所以一律吃記憶體那份。
    //   還沒讀過就回空並補讀一次，下一顆卡片就有了 —— 開播前 refresh() 會先跑，正常路徑不會空手。
    function scriptsFor(worldId) {
        if (!_packs) { _load(); return []; }
        const pack = _packs[worldId || currentWorldId()];
        if (!pack || pack.enabled === false || !Array.isArray(pack.scripts)) return [];
        return pack.scripts.filter(s => s && s.enabled !== false && s.find_regex);
    }

    // 這段區塊有沒有對應的「卡片型」正則？有就回渲染好的 HTML（整份文件已包成 iframe），沒有回 ''。
    function cardHtmlFor(blockText, worldId) {
        const text = String(blockText || '');
        if (!text) return '';
        for (const r of scriptsFor(worldId)) {
            if (!_isCardType(r.replace_string)) continue;
            const re = _toRegExp(r.find_regex, false);
            if (!re || !re.test(text)) continue;
            re.lastIndex = 0;
            return _wrapCard(text.replace(re, function () { return _expand(r.replace_string, arguments); }));
        }
        return '';
    }

    // 純文字型的顯示用正則（氣泡加代碼塊、隱藏思維鏈那類）：整段文字加工後回傳。
    //   卡片型不走這裡 —— 那是要彈出來的面板，交給 cardHtmlFor / renderRichHtml。
    function applyText(text, worldId) {
        let out = String(text || '');
        if (!out) return out;
        for (const r of scriptsFor(worldId)) {
            if (_isCardType(r.replace_string)) continue;
            if (r.source && r.source.ai_output === false) continue;
            if (r.destination && r.destination.display === false) continue;
            const re = _toRegExp(r.find_regex, true);
            if (!re) continue;
            try { out = out.replace(re, function () { return _expand(r.replace_string, arguments); }); } catch (e) {}
        }
        return out;
    }

    // 一段原文 → 可以直接塞進 innerHTML 的美化結果（開場白預覽用）。
    //   worldId 一定要傳：預覽是在「還沒踏進去」的時候看的，vn_current_world_id 還停在上一本書。
    //   順序：卡片型先抽走換成佔位符（免得後面的純文字加工／轉義動到那份 HTML）
    //        → 純文字型加工 → 轉義 → 佔位符換回真正的卡片。
    function renderRichHtml(text, escFn, worldId) {
        const esc = escFn || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        let out = String(text || '');
        if (!out) return '';
        const cards = [];
        for (const r of scriptsFor(worldId)) {
            if (!_isCardType(r.replace_string)) continue;
            const re = _toRegExp(r.find_regex, true);
            if (!re) continue;
            try {
                out = out.replace(re, function () {
                    cards.push(_wrapCard(_expand(r.replace_string, arguments)));
                    return '\u0000CARD' + (cards.length - 1) + '\u0000';
                });
            } catch (e) {}
        }
        out = applyText(out, worldId);
        out = esc(out);
        // 佔位符用 U+0000 包起來：那個字元不會出現在正文，也不會被 HTML 轉義動到
        out = out.replace(/\u0000CARD(\d+)\u0000/g, (m0, i) => cards[+i] || '');
        return out;
    }

    // 有沒有東西可套（UI 決定要不要顯示「美化」開關用）
    async function hasPack(worldId) {
        const pack = await getPack(worldId || currentWorldId());
        return !!(pack && Array.isArray(pack.scripts) && pack.scripts.length);
    }

    async function refresh() { _packs = null; _loading = null; return await _load(); }

    win.OS_CARD_REGEX = window.OS_CARD_REGEX = {
        saveFromCard, listPacks, getPack, setEnabled, removePack, hasPack, refresh,
        currentWorldId, scriptsFor, cardHtmlFor, applyText, renderRichHtml
    };

    // 開機先把庫讀進記憶體：VN 播放中間是同步取用，臨時才讀就來不及。
    _load();
})();
