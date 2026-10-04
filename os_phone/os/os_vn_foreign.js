// ----------------------------------------------------------------
// [檔案] os_vn_foreign.js
// 路徑：os_phone/os/os_vn_foreign.js
// 職責：🌐 外語角色（VN 正文）
//   設置 → 一般 → 外語：一個開關＋名單（誰講哪種語言）。開著時名單上的角色開口一律用他的語言，
//   括號附中文翻譯；對話框把翻譯拆到下面一行小字（VN_Core._splitTL），語音只念原文
//   （_speechOnly 只取「」內，翻譯在」外面），英文句自動挑角色配音的英文聲音。
//   VN 指令本來就有「外語台詞：[Char|名|表情|「外语」(简体翻译)]」這行，這裡只告訴它「誰」要這樣寫：
//   OS_VN_RULES.list() 在 core_format／core_format_free 後面接 promptLine()，酒館與手機版兩條路都吃得到。
//   關著或名單空的時候一個字都不多送。
// 存在 localStorage 'os_vn_foreign'：{ on, list: [{ name, lang }] }。改了當場存，不等「保存所有設定」。
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
    const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

    function get() {
        try {
            const r = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
            return {
                on: !!r.on,
                list: (Array.isArray(r.list) ? r.list : [])
                    .map(x => ({ name: String((x && x.name) || '').trim(), lang: LANG_NAME[x && x.lang] ? x.lang : 'en' }))
            };
        } catch (e) { return { on: false, list: [] }; }
    }
    function save(patch) {
        const next = { ...get(), ...(patch || {}) };
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { console.warn('[OS_VN_FOREIGN] 存不進去', e); }
        return next;
    }

    /** 插在 VN 指令「- 外語台詞：…」那行底下的一段（子項目）；關著或名單空回 '' */
    function promptLine() {
        const st = get();
        if (!st.on) return '';
        const rows = st.list.filter(x => x.name);
        if (!rows.length) return '';
        return '  - 下列角色開口時一律說自己的語言，每一句台詞都照這個寫法：「」裡寫該語言的原文，括號裡附上翻譯，翻譯用跟旁白同一種中文。他們的內心獨白、旁白，以及名單外的角色照常用中文。\n'
            + rows.map(x => `    ${x.name}：${LANG_NAME[x.lang]}`).join('\n');
    }

    // ── 設置頁 ──
    function html() {
        const st = get();
        const help = (id) => (win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn(id) : '';
        return `
            <div class="set-group">
                <div class="vcast-master-row">
                    <div class="set-label"><i class="fa-solid fa-language"></i> 外語角色${help('ss_vfor_on')}</div>
                    <label class="toggle-switch"><input type="checkbox" id="vfor-on" ${st.on ? 'checked' : ''}><span class="slider"></span></label>
                </div>
            </div>
            <div class="set-group">
                <div class="set-label"><i class="fa-solid fa-users"></i> 誰講外語${help('ss_vfor_list')}</div>
                <div id="vfor-list" class="vfor-list"></div>
                <div class="btn-test" id="vfor-add"><i class="fa-solid fa-plus"></i> 加角色</div>
            </div>`;
    }

    function wire(container) {
        const q = (id) => container.querySelector('#' + id);
        const list = q('vfor-list');
        if (!list) return;
        const collect = () => Array.prototype.map.call(list.querySelectorAll('.vfor-row'), r => ({
            name: (r.querySelector('.vfor-name').value || '').trim(),
            lang: r.querySelector('.vfor-lang').value
        }));
        let t = null;
        const persist = () => { clearTimeout(t); t = setTimeout(() => save({ list: collect() }), 250); };
        const row = (x) => {
            const r = document.createElement('div');
            r.className = 'vfor-row';
            r.innerHTML = `
                <input class="set-input vfor-name" type="text" placeholder="角色名字" value="${esc(x.name)}">
                <select class="set-select vfor-lang">${LANGS.map(([k, v]) => `<option value="${k}" ${x.lang === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
                <div class="vfor-del" title="拿掉"><i class="fa-solid fa-trash-can"></i></div>`;
            r.querySelector('.vfor-name').addEventListener('input', persist);
            r.querySelector('.vfor-lang').addEventListener('change', persist);
            r.querySelector('.vfor-del').onclick = () => { r.remove(); persist(); };
            return r;
        };
        get().list.forEach(x => list.appendChild(row(x)));
        const add = q('vfor-add');
        if (add) add.onclick = () => {
            const r = row({ name: '', lang: 'en' });
            list.appendChild(r);
            r.querySelector('.vfor-name').focus({ preventScroll: true });
        };
        const on = q('vfor-on');
        if (on) on.onchange = () => save({ on: on.checked });
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
            const s = splitTail(line);
            return s.tl ? s.orig : line;
        }).join('\n');
    }
    function langName(k) { return LANG_NAME[k] || ''; }

    const API = { LANGS, get, save, promptLine, html, wire, splitTail, stripTl, langName };
    win.OS_VN_FOREIGN = API;
    if (win !== window) window.OS_VN_FOREIGN = API;
})();
