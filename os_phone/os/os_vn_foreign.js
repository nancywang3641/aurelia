// ----------------------------------------------------------------
// [檔案] os_vn_foreign.js
// 路徑：os_phone/os/os_vn_foreign.js
// 職責：🌐 外語角色（VN 正文）
//   角色中心每個角色頁上「講什麼話」選一種語言（11-18 從設置搬過去，沒有總開關）。名單上的角色開口一律用他的語言，
//   括號附中文翻譯；對話框把翻譯拆到下面一行小字（VN_Core._splitTL），語音只念原文
//   （_speechOnly 只取「」內，翻譯在」外面），英文句自動挑角色配音的英文聲音。
//   VN 指令本來就有「外語台詞：[Char|名|表情|「外语」(简体翻译)]」這行，這裡只告訴它「誰」要這樣寫：
//   OS_VN_RULES.list() 在 core_format／core_format_free 後面接 promptLine()，酒館與手機版兩條路都吃得到。
//   名單空的時候一個字都不多送。
// 存在 localStorage 'os_vn_foreign'：{ v: 2, list: [{ name, lang, off? }] }（舊的 { on, list } 讀的時候換過來，見 _raw）。改了當場存。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const win = window.parent || window;
    const KEY = 'os_vn_foreign';
    const LANGS = [
        ['en', '英文'], ['ja', '日文'], ['ko', '韓文'], ['fr', '法文'], ['de', '德文'],
        ['es', '西班牙文'], ['it', '義大利文'], ['ru', '俄文'], ['pt', '葡萄牙文']
    ];
    const LANG_NAME = {};
    LANGS.forEach(([k, v]) => { LANG_NAME[k] = v; });

    // 11-18 起改在角色中心一個人一個選（她：「外語角色感覺可以放到角色中心?」），沒有總開關了：
    //   存 { v: 2, list: [{ name, lang, off? }] }；名單上有人就算開著。
    //   舊的 { on, list }：on 是 false 的那份名單整份標 off（劇情照舊講中文，角色中心那格顯示「中文」），選了語言就拿掉 off。
    function _raw() {
        let r = {};
        try { r = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { r = {}; }
        const oldOff = r.v !== 2 && !r.on;
        return (Array.isArray(r.list) ? r.list : [])
            .map(x => ({ name: String((x && x.name) || '').trim(), lang: LANG_NAME[x && x.lang] ? x.lang : 'en', off: !!(oldOff || (x && x.off)) }))
            .filter(x => x.name);
    }
    function _write(list) {
        return win.AUI.lsSet(KEY, JSON.stringify({ v: 2, list: list.map(x => x.off ? { name: x.name, lang: x.lang, off: true } : { name: x.name, lang: x.lang }) }), '外語角色名單');
    }
    // 名字找人：簡繁、間隔號不同也算同一個（OS_ZH.key），一字不差的優先
    function _idx(list, name) {
        const n = String(name || '').trim();
        if (!n) return -1;
        let i = list.findIndex(x => x.name === n);
        if (i >= 0) return i;
        const Z = win.OS_ZH || window.OS_ZH;
        if (!Z || !Z.key) return -1;
        const k = Z.key(n);
        return k ? list.findIndex(x => Z.key(x.name) === k) : -1;
    }
    function get() {
        const list = _raw().filter(x => !x.off).map(x => ({ name: x.name, lang: x.lang }));
        return { on: list.length > 0, list };
    }
    /** 這個角色講哪種語言（'en'…）；講中文回 '' */
    function langOf(name) {
        const list = _raw();
        const i = _idx(list, name);
        return (i >= 0 && !list[i].off) ? list[i].lang : '';
    }
    /** 角色中心改語言：lang 空或不認得＝講中文（從名單拿掉）。回 false＝沒存到 */
    function setLang(name, lang) {
        const n = String(name || '').trim();
        if (!n) return false;
        const list = _raw();
        const i = _idx(list, n);
        if (!LANG_NAME[lang]) { if (i < 0) return true; list.splice(i, 1); }
        else if (i >= 0) list[i] = { name: list[i].name, lang };
        else list.push({ name: n, lang });
        return _write(list);
    }
    /** 名單上所有名字（含舊名單關著的那些）：角色中心左邊要列出來，才改得到 */
    function names() { return _raw().map(x => x.name); }

    /** 插在 VN 指令「- 外語台詞：…」那行底下的一段（子項目）；名單空回 '' */
    function promptLine() {
        const st = get();
        if (!st.on) return '';
        const rows = st.list.filter(x => x.name);
        if (!rows.length) return '';
        return '  - 下列角色開口時一律說自己的語言，每一句台詞都照這個寫法：「」裡寫該語言的原文，括號裡附上翻譯，翻譯用跟旁白同一種中文。他們的內心獨白、旁白，以及名單外的角色照常用中文。\n'
            + rows.map(x => `    ${x.name}：${LANG_NAME[x.lang]}`).join('\n');
    }

    // ── 聊天 app 用：訊息「原文(翻譯)」把結尾那個括號拆出來 ──
    //   只拆「前面不是中文、括號裡是中文」的（日韓看假名／韓文字，其他看有沒有漢字），
    //   中文訊息後面的（輕笑）、英文的 (lol)、媒體標籤 [图片: …] 都不動。
    function isForeign(b) {
        return /[぀-ヿ가-힯]/.test(b) || (!/[㐀-鿿]/.test(b) && /[A-Za-zÀ-ɏЀ-ӿ]/.test(b));
    }
    function splitTail(text) {
        const s = String(text || '');
        const m = s.match(/^([\s\S]*?\S)\s*[（(]([^（）()]+)[)）]\s*$/);
        if (!m || !isForeign(m[1]) || !/[㐀-鿿]/.test(m[2])) return { orig: s, tl: '' };
        return { orig: m[1], tl: m[2].trim() };
    }
    // 送回模型的歷史不用翻譯（10-04 她：「雙語模式下，我覺得不要把翻譯 返回成上下文? 不然感覺好像挺耗TOKEN的?」）：
    //   每一行結尾、還有 [Voice: 原文 (翻譯)] 方括號裡的那個「（中文翻譯）」拿掉，只留原文；拆不出來的照原樣。
    function stripTl(text) {
        return String(text == null ? '' : text).split('\n').map(function (line) {
            line = line.replace(/\[([^\[\]]*)\]/g, function (m, inner) { const s = splitTail(inner); return s.tl ? '[' + s.orig + ']' : m; });
            // 行首的 [誰] 是誰說的，名字常是中文：不算進「前面是不是外文」，不然整行判成中文、翻譯剝不掉。
            //   帶冒號的 [Voice: …] 那種是內容，照舊算。
            const h = line.match(/^\s*\[[^\[\]:：]*\]\s*/);
            const head = h ? h[0] : '';
            const s = splitTail(line.slice(head.length));
            return s.tl ? head + s.orig : line;
        }).join('\n');
    }
    function langName(k) { return LANG_NAME[k] || ''; }

    const API = { LANGS, get, langOf, setLang, names, promptLine, splitTail, stripTl, langName };
    win.OS_VN_FOREIGN = API;
    if (win !== window) window.OS_VN_FOREIGN = API;
})();
