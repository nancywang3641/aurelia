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

    // 分頁名：先問卡片自己的 <title>（跟酒館資訊中心同一條規則），沒有才退正則的名字。
    //   正則名常是作者的簽名／防盜聲明（「✦某某社·By某某，此卡禁止出售✦」），整串塞進分頁列會擠爆 →
    //   剝掉裝飾符號、取「·」後面那段（多半才是這張面板真正的名字），再限長。
    function _panelTitle(rawHtml, scriptName) {
        const m = String(rawHtml || '').match(/<title>([\s\S]*?)<\/title>/i);
        let t = (m && m[1].trim()) || '';
        if (!t) {
            t = String(scriptName || '').replace(/[✦★☆◆■●※【】《》\[\]]/g, '').trim();
            if (t.indexOf('·') >= 0) t = t.split('·').pop().trim();
        }
        t = t.replace(/\s+/g, ' ').trim();
        if (!t) return '自定義面板';
        return t.length > 12 ? t.slice(0, 11) + '…' : t;
    }

    // 一段原文 → 這段裡「所有卡片型面板」，一張一筆、各自帶名字（資料中心那種一個面板一個分頁的用法）。
    //   跟 renderRichHtml 的差別：那支是把面板嵌回正文裡連著讀；這支是把面板一張張拆出來單獨陳列。
    //   名字取卡片自己的 <title>（跟酒館資訊中心同一條規則），沒有就退正則的名字。
    function cardsIn(text, worldId) {
        let src = String(text || '');
        const cards = [];
        if (!src) return [];
        // 🚨 一定要「邊比對邊把命中的段落換成佔位符」（同 renderRichHtml），不能每條規則都拿原文重比：
        //    卡片常有兩條規則盯同一個區塊（例：<播放器> 一條出播放器、另一條把非最新樓折疊起來），
        //    在酒館是前一條先把那段吃掉、後一條就比不中；拿原文各比一次的話兩條都中＝同一個東西出兩張面板。
        for (const r of scriptsFor(worldId)) {
            if (!_isCardType(r.replace_string)) continue;
            const re = _toRegExp(r.find_regex, true);
            if (!re) continue;
            try {
                src = src.replace(re, function () {
                    const raw = _cleanCard(_expand(r.replace_string, arguments));
                    cards.push({ title: _panelTitle(raw, r.script_name), html: _wrapCard(raw) });
                    return '\u0000CARD' + (cards.length - 1) + '\u0000';
                });
            } catch (e) {}
        }
        // 佔位符在文中的位置＝面板在劇情裡的先後 → 分頁順序照劇情走，不是照正則清單的順序
        const order = [];
        src.replace(/\u0000CARD(\d+)\u0000/g, (m0, i, off) => { order.push({ i: +i, off: off }); return m0; });
        order.sort((a, b) => a.off - b.off);
        const out = order.map(o => cards[o.i]).filter(Boolean);
        // 同一條規則一章命中好幾次（播放器那類帶 /g 的）→ 分頁名會重複，補序號才分得出誰是誰
        const seen = Object.create(null);
        return out.map(c => {
            seen[c.title] = (seen[c.title] || 0) + 1;
            return { title: seen[c.title] > 1 ? c.title + ' ' + seen[c.title] : c.title, html: c.html };
        });
    }

    // ── 📐 卡片面板(iframe)照內容撐高 ──────────────────────────────
    //   iframe 沒有自然高度，不撐就是預設 150px。兩個一定要處理的坑：
    //   ① 卡片的面板常做成 <details>，預設是收起來的 → 量到的只有標題那一條(110px)，
    //      畫面上看起來就是「面板被切掉」。預覽是要給人看內容的，載入時先展開。
    //   ② 高度不是量一次就算了：切分頁、換配色、使用者自己收合，內容隨時在變 →
    //      掛 ResizeObserver 跟著改，不然一動就爆版或留一大塊空白。
    function fitCardFrames(root, opts) {
        opts = opts || {};
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('iframe.vn-regex-card').forEach(fr => {
            if (fr._crFitted) return;   // 同一個 frame 只掛一次
            fr._crFitted = true;
            // 量內容底邊，不要用 documentElement.scrollHeight。
            //   🚨 documentElement.scrollHeight 至少等於 iframe 現在的高度 → 拿它當基準，高度只會長不會縮：
            //      面板一收起來就永遠留著一大塊空白。body.scrollHeight 也一樣，只要卡片把 body 設成 height:100%。
            //      改成量 body 子元素的實際底邊（外加 body 自己的下緣留白），漲跌都跟得上。
            const measure = (fd) => {
                const b = fd && fd.body;
                if (!b) return 0;
                let bottom = 0;
                Array.prototype.forEach.call(b.children, (c) => {
                    const r = c.getBoundingClientRect();
                    if (r.height) bottom = Math.max(bottom, r.bottom);
                });
                let h = bottom ? Math.ceil(bottom) : 0;
                if (h) {
                    try {
                        const cs = fd.defaultView.getComputedStyle(b);
                        h += (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.marginBottom) || 0);
                    } catch (e) {}
                }
                if (!h) h = b.scrollHeight || 0;   // 整份內容都絕對定位之類 → 退回 scrollHeight
                return Math.round(h);
            };
            const fit = () => {
                try {
                    const fd = fr.contentDocument;
                    if (!fd) return;
                    const h = measure(fd);
                    if (h > 20 && Math.abs(h - fr.clientHeight) > 2) fr.style.height = h + 'px';
                } catch (e) { if (!fr.style.height) fr.style.height = '60vh'; }
            };
            const ready = () => {
                try {
                    const fd = fr.contentDocument;
                    if (fd && opts.openDetails !== false) {
                        fd.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', 'true'));
                    }
                    const RO = fr.contentWindow && fr.contentWindow.ResizeObserver;
                    if (RO && fd && fd.body) {
                        const ro = new RO(() => fit());
                        ro.observe(fd.body);
                        if (fd.documentElement) ro.observe(fd.documentElement);
                    }
                    // <details> 的 toggle 不冒泡 → 用捕獲期接
                    if (fd) fd.addEventListener('toggle', fit, true);
                } catch (e) {}
                fit(); setTimeout(fit, 120); setTimeout(fit, 600);
            };
            fr.addEventListener('load', ready);
            // srcdoc 有可能在掛 listener 之前就載完了
            try { if (fr.contentDocument && fr.contentDocument.readyState === 'complete') ready(); } catch (e) {}
        });
    }

    // ── 🔇 停掉一段畫面裡「卡片自帶的 BGM」──────────────────────────
    //   角色卡的音樂面板＝<audio autoplay loop> ＋ 一段自己會 .play() 的腳本，整份包在 srcdoc iframe 裡。
    //   soft（預設）：暫停＋倒帶＋靜音＋拔掉 autoplay。面板還要留在畫面上給人看，但不准出聲。
    //   hard：連 iframe 一起拆掉。腳本是「載完、抓完網址」才 .play() 的，暫停一次擋不住晚一步才響的那種；
    //         把 iframe 的 document 整個銷毀才是真的停 —— 離開那一頁時一律用 hard。
    //   🚨 移除播放中的 <audio> 不保證會停（detached 仍會續播）→ 一定先 pause 再移除。
    function stopMedia(root, hard) {
        if (!root || !root.querySelectorAll) return;
        const stop = (m) => { try { m.pause(); m.currentTime = 0; m.muted = true; m.removeAttribute('autoplay'); } catch (e) {} };
        try {
            root.querySelectorAll('audio, video').forEach(stop);
            root.querySelectorAll('iframe').forEach(f => {
                // srcdoc 的 iframe 跟母文件同源，進得去
                try {
                    const idoc = f.contentWindow && f.contentWindow.document;
                    if (idoc) idoc.querySelectorAll('audio, video').forEach(stop);
                } catch (e) {}
                if (hard) {
                    try { f.removeAttribute('srcdoc'); f.removeAttribute('src'); } catch (e) {}
                    try { f.remove(); } catch (e) {}
                }
            });
            if (hard) root.querySelectorAll('audio, video').forEach(m => { try { m.remove(); } catch (e) {} });
        } catch (e) { console.warn('[卡片正則] 停掉自帶 BGM 失敗', e); }
    }

    // 有沒有東西可套（UI 決定要不要顯示「美化」開關用）
    async function hasPack(worldId) {
        const pack = await getPack(worldId || currentWorldId());
        return !!(pack && Array.isArray(pack.scripts) && pack.scripts.length);
    }

    async function refresh() { _packs = null; _loading = null; return await _load(); }

    win.OS_CARD_REGEX = window.OS_CARD_REGEX = {
        saveFromCard, listPacks, getPack, setEnabled, removePack, hasPack, refresh,
        currentWorldId, scriptsFor, cardHtmlFor, cardsIn, applyText, renderRichHtml, stopMedia, fitCardFrames
    };

    // 開機先把庫讀進記憶體：VN 播放中間是同步取用，臨時才讀就來不及。
    _load();
})();
