// ----------------------------------------------------------------
// [檔案] wx_theme_pack.js — 聊天 app 的主題包
// 路徑：os_phone/wx/wx_theme_pack.js
//
// 她：「不是配色，那太蠢了」。小手機圈說的「主題」是一整包美化樣式——
//   換的是整支 app 的長相（版面、形狀、字型、背景、標頭、輸入列），大家會互相分享，
//   拿到的人貼上或匯入檔案、存成一套、想換就切。這支就是那個。
//   原本「外觀」那排三組顏色改叫「配色」，照舊可以跟主題一起用：配色是底，主題疊在上面。
//
// 來源兩種：
//   ・匯入：貼上一份樣式，或選一個檔案（.css／.txt／自己匯出的那種）。
//   ・叫 AI 做：她描述感覺，主模型寫一整套（名冊 wx_theme）。
//     別的 app 的美化這裡套不上（零件名字不一樣），匯入時認得出來，可以叫 AI 照它的感覺改寫。
//
// 🚨 她選的：主題不管泡泡。泡泡還是每間聊天室各自設（wx_bubble_settings.js）。
//    所以寫到泡泡的規則整條丟掉，泡泡顏色那幾格變數也不准改。
//
// 🚨 範圍只在聊天 app 裡：每條規則都加上「在聊天 app 外殼裡、或外殼旁邊那幾層（聊天設置那種）」。
//    聊天設置、記事本、外送這些面板是外殼的「兄弟」，不是長在外殼裡面——只包外殼的話它們一條都吃不到。
//
// 🚨 主題改什麼都行，但不准把東西弄不見、弄不能按：
//    標頭、輸入列、分頁列、返回鈕這些，寫成隱藏／透明／點不到的那一句會被拿掉；
//    固定在螢幕上（position: fixed）、寫成整個螢幕寬高的也拿掉——那會跑出手機外面。
//
// 暴露：window.WX_THEME_PACK
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WeChat] 載入主題包 (wx_theme_pack.js)...');
    const win = window.parent || window;
    const d = win.document;

    const APP_ID = 'wx_theme_pack';
    const ACTIVE_KEY = 'wx_tp_active';
    const STYLE_ID = 'wx-theme-pack-style';
    const MAX_CSS = 200 * 1024;

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    function _db() { return win.OS_DB || window.OS_DB; }
    function _app() { return win.wxApp || window.wxApp; }
    function _toast(t) { try { const A = win.AUI || window.AUI; if (A && A.toast) A.toast(t); } catch (e) {} }
    function _confirm(msg) {
        try { const A = win.AUI || window.AUI; if (A && A.confirm) return Promise.resolve(A.confirm(msg)); } catch (e) {}
        return Promise.resolve(win.confirm ? win.confirm(msg) : true);
    }

    // ================================================================
    // 把一份樣式變成「只在聊天 app 裡、不碰泡泡、不把東西弄壞」的版本
    // ================================================================
    // 泡泡：她選了主題不管泡泡。頭像不算泡泡（圓頭像、方頭像是主題可以動的）。
    const BUBBLE_RE = /pbub-(?:bubble|row|me|other|wrap)\b|wx-bubble-(?:content|wrap|bare)\b|wx-msg-row\b|wx-typing|chat-bubble\b|chat-row\b/i;
    const BUBBLE_VAR_RE = /^--(?:pbub-|wx-bubble-)/i;
    // 弄不見就回不去的那些
    const PROTECT_RE = /wx-(?:shell|header|back-btn|icon-btn|footer-wrapper|input-(?:bar|box|real)|send-btn|plus-btn|bottom-nav|tab|page-container|page-room|page-list|room-scroll|modal-box|btn-(?:confirm|cancel))\b|ws-(?:overlay|header|close|body|footer|btn-save)\b|wxto-|wxnb-|wxmo-|wxpf-/i;
    // 聊天室裡的卡片（轉帳、紅包、禮物、位置、影片、檔案、連結、收款碼、分享、語音、通話、外送）：跟著主題換長相，
    //   但金額、狀態字（已收款、已領完、已過期）不准被藏掉——她點下去要知道收了沒
    const CARD_RE = /wx-(?:tf-|rpc-|gift-|loc-|vcard|file-|link-|receive-|wb-share-|app-share-|vmsg|call-rec)|wxto-card/i;
    const ROOT_RE = /^\s*(?::root|html|body)\s*$/i;
    // 🚨 頭像是一張照片，放在元素自己的背景圖上。主題寫 background 就會把照片整個蓋掉
    //    （她套的第一套：頭像全變成黃色六角形）。頭像只准改形狀、框、陰影、大小，背景那兩句拿掉。
    const AVATAR_RE = /wx-(?:avatar|bubble-avatar|me-avatar|rp-avatar|rp-item-avatar)\b|pbub-avatar\b|ws-avatar-circle\b|wxpf-(?:bg|avatar)\b/i;
    // 🚨 標題字太大會擠成兩行、壓到返回鈕（她截圖：群名兩行疊在「微信」上）：超過就壓回上限
    const TITLE_RE = /wx-header-title\b|ws-title\b|wx-modal-title\b|wx-name\b|wx-contact-name\b|wx-me-name\b/i;
    const TITLE_MAX_PX = 20;
    // 🚨 每頁最上面那條要往上長到手機狀態列底下（時間、電池坐在它自己的顏色上）。
    //    主題寫了自己的高度／上內距就把讓出來那塊吃掉 → 返回鈕、圖示鈕被壓到狀態列底下（她截圖）。
    //    主題照「不含狀態列」那塊寫，這裡替它把狀態列加回去。只認那條本身，不認它裡面的東西。
    const TOPBAR_RE = /\.(?:wx-header|ws-header|wxmo-bar|wxnb-head|wxto-head)(?![\w-])/i;
    function _isTopbar(sel) {
        return _splitTop(String(sel || ''), ',').some(function (s) {
            const last = s.trim().split(/\s*[\s>+~]\s*/).pop();
            return TOPBAR_RE.test(last);
        });
    }
    function _plusSafeTop(val) {
        const imp = /!important/i.test(val);
        const v = val.replace(/!important/i, '').trim();
        if (!/^(?:[\d.]+[a-z%]*|calc\(.*\)|var\(.*\))$/i.test(v) || /%$/.test(v)) return null;   // auto、fit-content、百分比不動
        return 'calc(' + v + ' + var(--safe-top, 0px))' + (imp ? ' !important' : '');
    }
    function _clampFont(val) {
        const m = String(val).match(/^\s*([\d.]+)\s*(px|rem|em)\s*(!important)?\s*$/i);
        if (!m) return val;
        const px = m[2].toLowerCase() === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
        return px > TITLE_MAX_PX ? (TITLE_MAX_PX + 'px' + (m[3] ? ' !important' : '')) : val;
    }

    // 逗號切選擇器，括號裡的逗號不算
    function _splitTop(s, sep) {
        const out = [];
        let depth = 0, q = '', cur = '';
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (q) { cur += c; if (c === q && s[i - 1] !== '\\') q = ''; continue; }
            if (c === '"' || c === "'") { q = c; cur += c; continue; }
            if (c === '(') depth++;
            else if (c === ')') depth = Math.max(0, depth - 1);
            if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        if (cur.trim()) out.push(cur);
        return out;
    }

    function _cleanDecls(cssText, sel) {
        const card = CARD_RE.test(sel);
        const prot = PROTECT_RE.test(sel) || card;
        const avatar = AVATAR_RE.test(sel);
        const title = TITLE_RE.test(sel);
        const topbar = _isTopbar(sel);
        const keep = [];
        _splitTop(String(cssText || ''), ';').forEach(function (decl) {
            const i = decl.indexOf(':');
            if (i < 0) return;
            const prop = decl.slice(0, i).trim().toLowerCase();
            const val = decl.slice(i + 1).trim();
            if (!prop || !val) return;
            const v = val.replace(/!important/i, '').trim().toLowerCase();
            if (BUBBLE_VAR_RE.test(prop)) return;                                          // 泡泡的格子不准動
            if (/javascript:|expression\s*\(|behavior\s*:/i.test(val)) return;
            if (prop === 'position' && v === 'fixed') return;                              // 會跑出手機外面
            if (/^(?:min-|max-)?(?:width|height)$/.test(prop) && /\b100v[wh]\b|\b\d+v(?:w|h|min|max)\b/.test(v)) return;
            if (avatar && (prop === 'background' || prop === 'background-image')) return;   // 會把照片蓋掉
            if (title && prop === 'font-size') { keep.push(prop + ': ' + _clampFont(val)); return; }
            if (topbar && /^(?:min-|max-)?height$|^padding-top$/.test(prop)) {
                const nv = _plusSafeTop(val);
                keep.push(prop + ': ' + (nv || val));
                return;
            }
            if (topbar && (prop === 'padding' || prop === 'padding-block')) {
                keep.push(prop + ': ' + val);
                const first = _splitTop(val.replace(/!important/i, '').trim(), ' ').filter(Boolean)[0];
                const nv = first && _plusSafeTop(first + (/!important/i.test(val) ? ' !important' : ''));
                if (nv) keep.push('padding-top: ' + nv);
                return;
            }
            if (prot) {
                if (prop === 'display' && v === 'none') return;
                if (prop === 'visibility' && v === 'hidden') return;
                if (prop === 'pointer-events' && v === 'none') return;
                if (prop === 'opacity' && parseFloat(v) < 0.3) return;
            }
            if (card) {
                if (prop === 'color' && v === 'transparent') return;                        // 字弄成透明＝藏起來
                if (prop === 'font-size' && parseFloat(v) === 0) return;
            }
            keep.push(prop + ': ' + val);
        });
        return keep.join('; ');
    }

    // 一條規則 → 加上範圍。回傳 '' ＝整條丟掉（全是泡泡、或清完沒有東西）
    function _scopeRule(selText, cssText) {
        const sels = _splitTop(String(selText || ''), ',').map(function (s) { return s.trim(); }).filter(Boolean);
        const out = [];
        let decls = null;
        sels.forEach(function (sel) {
            if (BUBBLE_RE.test(sel)) return;
            if (ROOT_RE.test(sel)) { out.push('.wx-shell', '.wx-shell ~ *'); return; }   // 變數寫在最外層＝外殼與它旁邊那幾層都吃得到
            if (/^\.wx-shell\b/.test(sel)) { out.push(sel); return; }                       // 本來就從外殼開始寫
            // 在外殼裡／外殼旁邊那一層本身／外殼旁邊那一層裡面
            out.push('.wx-shell ' + sel, '.wx-shell ~ ' + sel, '.wx-shell ~ * ' + sel);
        });
        if (!out.length) return '';
        decls = _cleanDecls(cssText, sels.join(','));
        if (!decls) return '';
        return out.join(',\n') + ' { ' + decls + '; }';
    }

    function _ruleBody(rule) {
        const t = String(rule.cssText || '');
        const a = t.indexOf('{'), b = t.lastIndexOf('}');
        return (a >= 0 && b > a) ? t.slice(a + 1, b) : '';
    }

    // 回傳 { ok, css, kept, dropped, ours }：ours＝有幾條寫的是這支 app 認得的零件（0＝多半是別的 app 的美化）
    function compile(raw) {
        let text = String(raw || '');
        if (text.length > MAX_CSS) return { ok: false, error: '這份太大了（超過 200KB）' };
        // 只收 Google 字型的 @import；其他外部檔案一律不載
        const imports = [];
        text = text.replace(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi, function (m, u) {
            if (/^https:\/\/fonts\.googleapis\.com\//i.test(u)) imports.push('@import url("' + u + '");');
            return '';
        });
        const Sheet = win.CSSStyleSheet || window.CSSStyleSheet;
        let sheet;
        try { sheet = new Sheet(); sheet.replaceSync(text); }
        catch (e) { return { ok: false, error: '讀不懂這份樣式' }; }
        let kept = 0, dropped = 0, ours = 0;
        const walk = function (rules) {
            const acc = [];
            for (let i = 0; i < rules.length; i++) {
                const r = rules[i];
                if (r.selectorText != null) {                                  // 一般規則
                    const s = _scopeRule(r.selectorText, _ruleBody(r));
                    if (s) { acc.push(s); kept++; if (/\.(?:wx|ws)-[\w-]+/i.test(r.selectorText)) ours++; }   // ours 只算這支 app 的零件：別人的美化也常寫 :root／body，那不算數
                    else dropped++;
                } else if (r.media && r.cssRules) {                            // @media
                    const inner = walk(r.cssRules);
                    if (inner.length) acc.push('@media ' + r.media.mediaText + ' {\n' + inner.join('\n') + '\n}');
                } else if (r.conditionText != null && r.cssRules) {            // @supports
                    const inner = walk(r.cssRules);
                    if (inner.length) acc.push('@supports ' + r.conditionText + ' {\n' + inner.join('\n') + '\n}');
                } else if (r.name != null && r.cssRules) {                     // @keyframes
                    acc.push(r.cssText);
                } else if (/^@font-face/i.test(r.cssText || '')) {
                    if (!/javascript:/i.test(r.cssText)) acc.push(r.cssText);
                }
            }
            return acc;
        };
        const body = walk(sheet.cssRules);
        return { ok: true, css: imports.join('\n') + (imports.length ? '\n' : '') + body.join('\n'), kept: kept, dropped: dropped, ours: ours };
    }

    // ================================================================
    // 存取：主題跟著這支手機走，不分故事
    // ================================================================
    let _list = null;
    async function load() {
        if (_list) return _list;
        const db = _db();
        try { const v = db && db.getAppData ? await db.getAppData(APP_ID, 'list', null) : null; _list = Array.isArray(v) ? v : []; }
        catch (e) { _list = []; }
        return _list;
    }
    async function _save() {
        const db = _db();
        if (!db || !db.saveAppData) return false;
        try { await db.saveAppData(APP_ID, 'list', _list || [], null); return true; }
        catch (e) { console.warn('[主題] 存不進去', e); _toast('存不進去，再試一次'); return false; }
    }
    function activeId() { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch (e) { return ''; } }

    // 主題後面墊的一層（主題寫了 !important 也壓得過：選擇器更長、排在最後）
    const SAFETY = [
        '.wx-shell .wx-header .wx-header-title, .wx-shell ~ * .ws-header .ws-title {',
        '  white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;',
        '  min-width: 0 !important; max-width: 62% !important; line-height: 1.3 !important; }',
        '.wx-shell .wx-chat-item .wx-name, .wx-shell .wx-contact-item .wx-contact-name {',
        '  white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }',
        // 最底下那條放手機的橫槓，是外殼自己的下內距讓出來的；主題寫 padding 會把它吃掉，分頁列就壓到橫槓上
        '.aps-app-body > .aps-mount > .wx-shell { padding-bottom: var(--aps-safe-bottom, 0px) !important; box-sizing: border-box !important; }',
        // 那條露出來的是外殼的底色，主題常把外殼跟分頁列做成兩個顏色 → 底下多一條不相干的色帶。
        // 讓分頁列／輸入列往下多長一塊自己的底，跟真手機一樣一路鋪到最底
        '.aps-app-body .wx-shell > .wx-bottom-nav { position: relative; }',
        '.aps-app-body .wx-shell > .wx-bottom-nav::after, .aps-app-body .wx-shell > .wx-footer-wrapper::after {',
        '  content: "" !important; position: absolute !important; left: 0 !important; right: 0 !important; top: 100% !important;',
        '  height: var(--aps-safe-bottom, 0px) !important; background: inherit !important; pointer-events: none !important; }',
        // 🚨 圖示是字型畫的（Font Awesome）。主題替整片換字型（.wx-shell * { font-family }）就把圖示也換掉，
        //    找不到那個字只剩框框（她：三次 Persona5 按鈕全變框框）。:not(#_) 讓這條比主題任何寫法都重。
        '.wx-shell :is(.fa-solid,.fas,.fa-regular,.far):not(#_), .wx-shell ~ * :is(.fa-solid,.fas,.fa-regular,.far):not(#_) {',
        '  font-family: "Font Awesome 6 Free" !important; font-style: normal !important; }',
        '.wx-shell :is(.fa-solid,.fas):not(#_), .wx-shell ~ * :is(.fa-solid,.fas):not(#_) { font-weight: 900 !important; }',
        '.wx-shell :is(.fa-regular,.far):not(#_), .wx-shell ~ * :is(.fa-regular,.far):not(#_) { font-weight: 400 !important; }',
        '.wx-shell :is(.fa-brands,.fab):not(#_), .wx-shell ~ * :is(.fa-brands,.fab):not(#_) { font-family: "Font Awesome 6 Brands" !important; font-weight: 400 !important; font-style: normal !important; }',
        // 卡片上的字跟底色分不開時（主題換了底色沒換字色），_fixCardInk 掛這兩個 class
        // 記事本、個人檔案卡是疊在外殼旁邊的另一層，不在 .wx-shell 裡：這兩個 class 只有 _fixCardInk 會掛，不用限範圍
        '.wxtp-ink-dark:not(#_):not(#_) { color: #141414 !important; }',
        '.wxtp-ink-light:not(#_):not(#_) { color: #ffffff !important; }',
        '.wxtp-ink-dark:not(#_):not(#_)::placeholder { color: rgba(20, 20, 20, .5) !important; }',
        '.wxtp-ink-light:not(#_):not(#_)::placeholder { color: rgba(255, 255, 255, .6) !important; }'
    ].join('\n');

    // ── 卡片上的字看不看得清楚：主題常只換卡片底色、沒換字色（紅包祝福語本來是白字，底換成淺色就看不見）。
    //    套著主題時，每行卡片字跟它底下那層的顏色比一次，對比太低就換成黑字或白字。卡片是聊天室一則一則畫出來的，
    //    所以盯著聊天 app 有沒有新東西長出來，有就再比一次。沒套主題時全部收掉。
    const CARD_TEXT = '.wx-tf-title,.wx-tf-sub,.wx-rpc-memo,.wx-rpc-sub,.wx-rpc-foot,.wx-gift-title-text,.wx-gift-footer,'
        + '.wx-loc-name,.wx-loc-addr,.wx-vcard-title,.wx-vcard-dur,.wx-file-name,.wx-file-size,.wx-link-title,.wx-link-foot,'
        + '.wx-receive-head,.wx-receive-amt,.wx-receive-foot,.wx-wb-share-author,.wx-wb-share-text,.wx-app-share-top,.wx-app-share-title,.wx-app-share-text,'
        + '.wxto-card-hd,.wxto-card-shop,.wxto-card-items,.wxto-card-amt,.wxto-card-ft,.wxto-card-note,.wxto-card-kind,'
        // 記事本與個人檔案卡的字：顏色也是自己寫死的（記事本是深咖啡字），主題換了底色一樣會看不見
        + '.wxnb-back,.wxnb-title,.wxnb-sub,.wxnb-search,.wxnb-q,.wxnb-card-t,.wxnb-card-b,.wxnb-card-f,.wxnb-who,.wxnb-empty-t,.wxnb-empty-s,'
        + '.wxnb-edit-who,.wxnb-edit-body,.wxnb-edit-x,.wxnb-in-t,.wxnb-in-b,.wxnb-thumb-desc,.wxnb-more,'
        + '.wxpf-name,.wxpf-bio,.wxpf-act,.wxpf-x';
    function _rgb(str) {
        const m = String(str || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i);
        if (!m) return null;
        let a = m[4] == null ? 1 : parseFloat(m[4]);
        if (m[4] && /%$/.test(m[4])) a = a / 100;
        return { r: +m[1], g: +m[2], b: +m[3], a: a };
    }
    function _lum(c) {
        const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function _contrast(a, b) { const x = _lum(a), y = _lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    // 字底下實際的顏色：往外一層一層找第一個不透明的底色；漸層取第一個顏色；遇到圖片（地圖、照片）不判斷
    function _bgOf(el) {
        const w = el.ownerDocument.defaultView;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const cs = w.getComputedStyle(n);
            const img = cs.backgroundImage || '';
            if (img && img !== 'none') {
                if (/url\(/i.test(img)) return null;
                const g = _rgb(img);
                if (g && g.a > 0.5) return g;
            }
            const c = _rgb(cs.backgroundColor);
            if (c && c.a > 0.5) return c;
            if (n.classList && n.classList.contains('wx-shell')) break;
        }
        return null;
    }
    function _fixCardInk(root) {
        const box = root || d;
        box.querySelectorAll(CARD_TEXT).forEach(function (el) {
            el.classList.remove('wxtp-ink-dark', 'wxtp-ink-light');
            if (!String(el.textContent || el.value || el.placeholder || '').trim()) return;   // 搜尋框那種沒字只有提示字的也要看
            const w = el.ownerDocument.defaultView;
            const fg = _rgb(w.getComputedStyle(el).color);
            const bg = _bgOf(el);
            if (!fg || !bg) return;
            if (_contrast(fg, bg) >= 3) return;
            const black = { r: 20, g: 20, b: 20 }, white = { r: 255, g: 255, b: 255 };
            el.classList.add(_contrast(black, bg) >= _contrast(white, bg) ? 'wxtp-ink-dark' : 'wxtp-ink-light');
        });
    }
    let _inkObs = null, _inkT = 0;
    function _watchCardInk(on) {
        if (_inkObs) { _inkObs.disconnect(); _inkObs = null; }
        clearTimeout(_inkT);
        if (!on) { d.querySelectorAll('.wxtp-ink-dark,.wxtp-ink-light').forEach(function (el) { el.classList.remove('wxtp-ink-dark', 'wxtp-ink-light'); }); return; }
        const run = function () { clearTimeout(_inkT); _inkT = setTimeout(function () { try { _fixCardInk(d); } catch (e) {} }, 120); };
        try {
            _inkObs = new (d.defaultView.MutationObserver)(function (muts) {
                for (let i = 0; i < muts.length; i++) {
                    const t = muts[i].target;
                    if (t && t.closest && t.closest('.wx-shell, .aps-mount')) { run(); return; }
                }
            });
            _inkObs.observe(d.body, { childList: true, subtree: true });
        } catch (e) {}
        run();
    }

    function _inject(css) {
        let st = d.getElementById(STYLE_ID);
        if (!css) { if (st) st.remove(); _watchCardInk(false); return; }
        css = css + '\n' + SAFETY;
        if (!st) { st = d.createElement('style'); st.id = STYLE_ID; }
        // 永遠排在 head 最後：主題要壓過 app 自己的樣式
        (d.head || d.documentElement).appendChild(st);
        st.textContent = css;
        _watchCardInk(true);
    }
    async function apply(id) {
        await load();
        const t = id ? _list.find(function (x) { return x.id === id; }) : null;
        if (id && !t) id = '';
        try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
        _inject(t ? compile(t.css).css : '');
        _renderPage();
        return !!t || !id;
    }
    async function add(name, css, src) {
        await load();
        const t = { id: 'tp' + Date.now().toString(36), name: String(name || '').trim().slice(0, 30) || '我的主題', css: String(css || ''), src: src || 'import', at: Date.now() };
        _list.unshift(t);
        await _save();
        return t;
    }
    async function rename(id, name) {
        await load();
        const t = _list.find(function (x) { return x.id === id; });
        if (!t || !String(name || '').trim()) return;
        t.name = String(name).trim().slice(0, 30);
        await _save();
        _renderPage();
    }
    async function remove(id) {
        await load();
        _list = _list.filter(function (x) { return x.id !== id; });
        await _save();
        if (activeId() === id) await apply('');
        else _renderPage();
    }

    // 匯出成一份純文字：開頭一行寫名字，別人匯入時名字會自己帶進來
    function exportText(t) { return '/* 主題：' + String(t.name || '').replace(/\*\//g, '') + ' */\n' + String(t.css || ''); }
    function _nameFromText(text) { const m = String(text || '').match(/^\s*\/\*\s*主題[:：]\s*([^*]+?)\s*\*\//); return m ? m[1].trim() : ''; }
    // 匯入的東西可能是 JSON（別人的小手機匯出的外觀檔）：挑出裡面的樣式那格
    function _cssFromAnything(text) {
        const t = String(text || '').trim();
        if (/^\{[\s\S]*\}$/.test(t)) {
            try {
                const j = JSON.parse(t);
                const c = j.css || j.globalCss || j.customCSS || j.theme_css || j.value || '';
                if (typeof c === 'string' && c.trim()) return c;
            } catch (e) {}
        }
        return t;
    }

    // ================================================================
    // 叫 AI 做一套（名冊 wx_theme，預設主模型）
    // ================================================================
    // 🚨 寫給一個從沒看過這支 app 的人：零件叫什麼、各是哪一塊，說清楚；不給範例（它會照抄）。
    const PARTS = [
        '整支 app 的最外層：.wx-shell（底、字型都從這裡開始）',
        '每頁最上面那條：.wx-header；標題 .wx-header-title；返回鈕 .wx-back-btn；右上角的圖示鈕 .wx-icon-btn；聊天室右上的記事本鈕 .wxnb-head-btn 與選單鈕 .wx-head-menu-btn。標頭裡的字和圖示預設都跟著 .wx-header 的 color 走',
        '聊天列表頁：.wx-page-list；每一列 .wx-chat-item；頭像 .wx-avatar；右邊文字區 .wx-info；名字 .wx-name；最後一句 .wx-last-msg；時間 .wx-meta；未讀數 .wx-badge',
        '底部分頁列：.wx-bottom-nav；每一格 .wx-tab（選中的那格多一個 .active）；圖示 .wx-tab-icon；字 .wx-tab-txt；紅點數字 .wx-tab-badge。圖示和字的顏色都跟著 .wx-tab 的 color 走，選中與沒選中的顏色都要寫',
        '聊天室：整頁 .wx-page-room；背景 .wx-room-bg；訊息捲動區 .wx-room-scroll；系統提示那一行 .wx-system-notice；時間分隔 .wx-time-stamp；聊天室裡的頭像 .wx-bubble-avatar；對方訊息上面那條可以點開的「思考」.wx-think-fold（標題列 .wx-think-head，點開的內容 .wx-think-body，底色與字色要跟聊天室背景分得開）',
        '輸入列：整條 .wx-footer-wrapper；.wx-input-bar；打字框外框 .wx-input-box；打字框 .wx-input-real；送出 .wx-send-btn；加號 .wx-plus-btn',
        '聊天室裡的卡片（跟著主題換長相）：轉帳 .wx-tf-card（已收款多 .is-ok，退回或過期多 .is-back），圖示圈 .wx-tf-icon，標題 .wx-tf-title，小字 .wx-tf-sub；紅包 .wx-rpc-card（領完多 .is-empty），上半 .wx-rpc-top，紅包袋 .wx-rpc-env，袋上的圓 .wx-rpc-coin，祝福語 .wx-rpc-memo，狀態 .wx-rpc-sub，下緣 .wx-rpc-foot；禮物 .wx-gift-card-blue，上半 .wx-gift-top，圖示 .wx-gift-icon-gold，字 .wx-gift-title-text，下緣 .wx-gift-footer；位置 .wx-loc-card，地圖 .wx-loc-map，圖釘 .wx-loc-pin，下半 .wx-loc-info，地名 .wx-loc-name，地址 .wx-loc-addr；影片 .wx-vcard，播放鈕 .wx-vcard-play，標題 .wx-vcard-title，時長 .wx-vcard-dur；檔案 .wx-file-card，檔名 .wx-file-name，大小 .wx-file-size；連結 .wx-link-msg，標題 .wx-link-title，下緣 .wx-link-foot，右邊縮圖 .wx-link-thumb；收款碼 .wx-receive-msg，上緣 .wx-receive-head，碼 .wx-receive-qr，金額 .wx-receive-amt，下緣 .wx-receive-foot；微博分享 .wx-wb-share-card；其他 app 分享 .wx-app-share-card；外送單 .wxto-card，上緣 .wxto-card-hd，店名 .wxto-card-shop，品項 .wxto-card-items，金額 .wxto-card-amt，下緣 .wxto-card-ft',
        '加號打開的功能面板：.wx-action-panel；每個功能 .wx-grid-item；圖示 .wx-grid-icon；字 .wx-grid-label；翻頁點 .wx-dot（目前那頁多 .active）',
        '通訊錄：分區 .wx-contact-section；每個人 .wx-contact-item；名字 .wx-contact-name；圖示 .wx-contact-icon',
        '「我」那頁上方：.wx-me-header；頭像 .wx-me-avatar；名字 .wx-me-name；帳號 .wx-me-id；簽名 .wx-me-signature',
        '一格一格的清單（設置、「我」）：一組 .wx-cell-group；每格 .wx-cell；左邊圖示 .wx-cell-icon；字 .wx-cell-text；右邊箭頭 .wx-cell-arrow；小標 .wx-set-label；說明字 .wx-set-desc',
        '彈出小窗：遮罩 .wx-modal-overlay；窗 .wx-modal-box；標題 .wx-modal-title；輸入框 .wx-modal-input；取消 .wx-btn-cancel；確定 .wx-btn-confirm',
        '記事本（聊天室右上角那本書點開的整頁）：整頁 .wxnb-root；上方 .wxnb-head，返回 .wxnb-back，標題 .wxnb-title，副標 .wxnb-sub；搜尋框 .wxnb-search；卡片牆 .wxnb-grid；每張卡 .wxnb-card（標題 .wxnb-card-t、內文 .wxnb-card-b、下緣 .wxnb-card-f、照片 .wxnb-card-ph）；右下新增鈕 .wxnb-fab；沒有東西時 .wxnb-empty；編輯頁 .wxnb-edit，上方列 .wxnb-edit-bar，內文 .wxnb-edit-body，完成 .wxnb-edit-ok，關閉 .wxnb-edit-x',
        '個人檔案卡（點頭像開出來的整屏）：整張 .wxpf-root（鋪底的是這個人自己的背景照片 .wxpf-bg，不要蓋掉）；照片上的暗層 .wxpf-scrim；中間資訊 .wxpf-main；頭像 .wxpf-avatar 與外圈 .wxpf-ring；名字 .wxpf-name；簽名 .wxpf-bio；底下動作鈕一排 .wxpf-acts、每顆 .wxpf-act；關閉 .wxpf-x',
        '聊天設置（從聊天室右上角進去那一層）：.ws-overlay；標頭 .ws-header；標題 .ws-title；關閉 .ws-close；內容 .ws-body；一組 .ws-group；每格 .ws-cell；字 .ws-label；輸入框 .ws-input；開關 .ws-switch；頭像圓框 .ws-avatar-circle；疊在頭像上的相機 .ws-avatar-icon；底部 .ws-footer；保存 .ws-btn-save'
    ];
    const VARS = '--wx-page 整頁的底、--wx-bar 分頁列與輸入列、--wx-surface 卡片與列、--wx-surface-2 輸入框與按下去的底、--wx-header 標頭、--wx-line 分隔線、--wx-line-strong 明顯的框、--wx-arrow 箭頭與佔位字、--wx-ink 標題字、--wx-ink-2 內文、--wx-ink-3 次要字、--wx-ink-soft 再淡一層、--wx-ink-dim 時間與說明、--wx-fill 沒圖時的頭像底、--wx-accent 重點色（主要按鈕、選中）、--wx-accent-ink 重點色當字用的深一階、--wx-on-accent 疊在重點色上的字、--wx-danger 未讀紅點與刪除（保持紅色系）、--wx-link 可點的字';

    function _aiMessages(want, ref) {
        const sys = [
            '你替一支手機聊天 app 設計「主題」：一整包 CSS，換掉整支 app 的長相。',
            '主題不只是換顏色：要動到形狀（圓角、邊框、陰影）、間距與密度、字型與字級字重、背景（漸層、紋理）、標頭與分頁列與輸入列的造型、清單的排法、圖示的樣子。整體要看得出是一種風格，而不是同一個版面換了顏色。',
            '',
            '這支 app 的零件（只能用這些名字）：',
            PARTS.map(function (p) { return '・' + p; }).join('\n'),
            '',
            '顏色格子（寫在 :root 裡會整支 app 一起換）：' + VARS,
            '',
            '尺寸（這是手機畫面，照這個比例設計）：',
            '・整支 app 寬約 360px（手機直立），高約 800px。',
            '・最上面約 40px 是手機的狀態列（時間、訊號、電池），標頭會自動往上長去墊在它底下；標頭的高度與內距照「狀態列以下那塊」寫就好，不用自己加。',
            '・標頭高約 45px；標題一行、字 15～18px，左邊是返回、右邊是圖示鈕，三樣在這 45px 裡上下置中。標題太大會擠成兩行壓到它們。',
            '・最底下約 26px 放手機的橫槓，露出來的是 .wx-shell 的底色：外殼底色跟分頁列、輸入列同一個顏色才接得成一整塊；分頁列與輸入列不要自己加底部內距或外距，也不要用 position 釘到最底。',
            '・聊天列表每一列高約 72px，頭像約 48px；聊天室裡的頭像約 40px；名字字級 15～17px。',
            '・底部分頁列高約 55px，三格平分；輸入列高約 56px，打字框高約 36px。',
            '・頭像是一張照片，只能改形狀（圓角、裁切）、邊框、陰影、大小；不要寫 background，會把照片蓋掉。',
            '・字級整體別超過 20px，標籤、說明這種小字 11～13px。',
            '',
            '規則：',
            '・訊息泡泡不歸主題管，不要寫任何跟泡泡有關的樣式。',
            '・聊天室裡的卡片要跟整套風格一致，但每一種都要一眼認得出是什麼（紅包還是紅包、轉帳還是轉帳）；換了卡片哪一塊的底色，同一條就要把那塊的字色一起寫，卡片裡的標題、小字、金額才看得清楚（有些卡片的字原本是白色）；金額、店名、狀態字要清楚；已收款、退回、領完這幾種要跟還沒處理的看得出不同。檔案圖示 .wx-file-icon 的底色代表檔案種類，不要改。',
            '・不要把任何東西藏起來、弄透明、弄得點不到；不要用 position: fixed；寬高不要用螢幕單位（vw、vh）。',
            '・這支 app 自己的樣式有不少寫在元素身上，要蓋過它們就加 !important。',
            '・字型只能從 Google Fonts 用 @import 引入，其他外部檔案不要用。按鈕上的小圖示是另一套圖示字型畫的，字型只換文字就好，不要寫成全部元素（*）一起換。',
            '・深色與淺色：做成一套固定的樣子就好，不用另外寫夜晚版。',
            '',
            '輸出格式固定，標籤名照抄英文，除此之外不要寫任何字：',
            '<theme name="主題名稱（中文，十個字以內）">',
            '這裡放完整的 CSS',
            '</theme>'
        ].join('\n');
        let user = '想要的感覺：' + (String(want || '').trim() || '照你的判斷做一套有個性的');
        if (ref) user += '\n\n底下是別的 app 用的一份美化，零件名字跟這支不一樣、不能直接用；請抓它的風格（配色、形狀、字型、氣氛），用這支 app 的零件重新寫一套：\n' + String(ref).slice(0, 12000);
        return [{ role: 'system', content: sys }, { role: 'user', content: user }];
    }
    function _parseAi(text) {
        const t = String(text || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        const m = t.match(/[<＜]\s*theme\b([^>＞]*)[>＞]([\s\S]*?)[<＜]\s*\/\s*theme\s*[>＞]/i);
        let name = '', css = '';
        if (m) {
            const n = String(m[1] || '').match(/name\s*=\s*["“”＂']([^"“”＂']+)["“”＂']/i);
            name = n ? n[1].trim() : '';
            css = m[2];
        } else {
            const fence = t.match(/```(?:css)?\s*([\s\S]*?)```/i);
            css = fence ? fence[1] : '';
        }
        css = String(css || '').replace(/^\s*```(?:css)?/i, '').replace(/```\s*$/, '').trim();
        return { name: name, css: css };
    }
    function generate(want, ref) {
        return new Promise(function (resolve, reject) {
            const O = win.OS_API || window.OS_API;
            if (!O || !O.chatMain) { reject(new Error('模型連線還沒載入')); return; }
            O.chatMain(_aiMessages(want, ref), null,
                function (text) {
                    const r = _parseAi(text);
                    if (!r.css) { reject(new Error('它沒有照格式回')); return; }
                    const c = compile(r.css);
                    if (!c.ok || !c.kept) { reject(new Error(c.error || '寫出來的樣式一條都用不上')); return; }
                    resolve(r);
                },
                function (e) { reject(e instanceof Error ? e : new Error(String((e && e.message) || e))); },
                { task: 'wx_theme', label: '聊天 app 主題' });
        });
    }

    // ================================================================
    // 主題頁（「我」→ 設置 → 外觀 → 主題）
    // ================================================================
    let _root = null, _sheet = '', _busy = false, _draft = { text: '', name: '', want: '', foreign: false };
    let _obs = null;

    async function open() {
        const a = _app();
        const host = a && a.APP_CONTAINER;
        if (!host) return false;
        close();
        _sheet = ''; _draft = { text: '', name: '', want: '', foreign: false };
        _root = d.createElement('div');
        _root.className = 'wxtp-root';
        host.appendChild(_root);
        _root.addEventListener('click', _onClick);
        _root.addEventListener('input', _onInput);
        _guard(host);
        await load();
        _renderPage();
        return true;
    }
    function close() {
        if (_obs) { try { _obs.disconnect(); } catch (e) {} _obs = null; }
        if (_root) { try { _root.remove(); } catch (e) {} }
        _root = null;
    }
    // 聊天 app 整頁重畫會清掉蓋在上面的頁（外送頁那次學到的）：被清掉就貼回去
    function _guard(host) {
        const MO = win.MutationObserver || window.MutationObserver;
        if (!MO) return;
        _obs = new MO(function () {
            if (!_root) return;
            if (!host.isConnected) { close(); return; }
            if (!_root.isConnected) { _root.classList.add('is-back'); host.appendChild(_root); }   // 貼回去不要再滑進來一次（會閃）
        });
        _obs.observe(host, { childList: true });
    }

    function _fmt(ts) { const t = new Date(ts || Date.now()); return (t.getMonth() + 1) + '/' + t.getDate(); }

    function _renderPage() {
        if (!_root) return;
        const cur = activeId();
        const list = _list || [];
        const row = function (id, name, sub, on) {
            return '<div class="wxtp-row' + (on ? ' is-on' : '') + '">' +
                '<div class="wxtp-row-t"><b>' + esc(name) + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>' +
                (on ? '<span class="wxtp-using"><i class="fa-solid fa-check"></i>使用中</span>'
                    : '<button type="button" class="wxtp-use" data-act="use" data-id="' + esc(id) + '">套用</button>') +
                (id ? '<button type="button" class="wxtp-more" data-act="more" data-id="' + esc(id) + '"><i class="fa-solid fa-ellipsis"></i></button>' : '<span class="wxtp-more-pad"></span>') +
                '</div>';
        };
        let body =
            '<div class="wxtp-list">' +
            row('', '原本的樣子', '不套主題', !cur) +
            list.map(function (t) { return row(t.id, t.name, (t.src === 'ai' ? 'AI 做的' : '匯入的') + ' · ' + _fmt(t.at), cur === t.id); }).join('') +
            '</div>' +
            (list.length ? '' : '<div class="wxtp-empty"><i class="fa-solid fa-swatchbook"></i><div>還沒有主題</div><span>匯入別人分享的美化，或描述你想要的感覺請 AI 做一套</span></div>') +
            '<div class="wxtp-note">主題換的是整支聊天 app 的長相，泡泡不算在內——泡泡還是在每間聊天室的聊天設置裡各自設。</div>';

        let sheet = '';
        if (_sheet === 'import') {
            sheet =
                '<div class="wxtp-sheet">' +
                '<div class="wxtp-sheet-bar"><button type="button" class="wxtp-sheet-x" data-act="sheet-close">取消</button><div class="wxtp-sheet-t">匯入主題</div><button type="button" class="wxtp-sheet-ok" data-act="import-save"' + (_draft.text.trim() && !_busy ? '' : ' disabled') + '>存</button></div>' +
                '<div class="wxtp-sheet-body">' +
                '<input class="wxtp-in" data-f="name" type="text" maxlength="30" placeholder="主題名稱" value="' + esc(_draft.name) + '" autocomplete="off">' +
                '<textarea class="wxtp-area" data-f="text" placeholder="把別人分享的美化貼在這裡" spellcheck="false">' + esc(_draft.text) + '</textarea>' +
                '<button type="button" class="wxtp-file" data-act="file"><i class="fa-solid fa-file-import"></i>從檔案匯入</button>' +
                (_draft.foreign
                    ? '<div class="wxtp-warn"><i class="fa-solid fa-triangle-exclamation"></i><div><b>這份看起來是別的 app 的美化</b><span>零件名字跟這支聊天 app 不一樣，直接存了也套不上。可以請 AI 照這份的感覺，改寫成這裡能用的。</span>' +
                      '<button type="button" class="wxtp-mini" data-act="convert"' + (_busy ? ' disabled' : '') + '>' + (_busy ? '<i class="fa-solid fa-spinner fa-spin"></i>改寫中…' : '<i class="fa-solid fa-wand-magic-sparkles"></i>請 AI 改寫') + '</button></div></div>'
                    : '') +
                '</div></div>';
        } else if (_sheet === 'ai') {
            sheet =
                '<div class="wxtp-sheet">' +
                '<div class="wxtp-sheet-bar"><button type="button" class="wxtp-sheet-x" data-act="sheet-close">取消</button><div class="wxtp-sheet-t">請 AI 做一套</div><span class="wxtp-sheet-pad"></span></div>' +
                '<div class="wxtp-sheet-body">' +
                '<textarea class="wxtp-area wxtp-area-s" data-f="want" placeholder="想要什麼感覺：風格、氣氛、像什麼東西" spellcheck="false">' + esc(_draft.want) + '</textarea>' +
                '<button type="button" class="wxtp-go" data-act="ai-go"' + (_busy ? ' disabled' : '') + '>' + (_busy ? '<i class="fa-solid fa-spinner fa-spin"></i>正在做…' : '<i class="fa-solid fa-wand-magic-sparkles"></i>做一套') + '</button>' +
                '<div class="wxtp-hint">做好會直接套上，不喜歡可以換回原本的樣子或刪掉。</div>' +
                '</div></div>';
        }

        _root.innerHTML =
            '<div class="wxtp-head">' +
            '  <button class="wxtp-back" type="button" data-act="close"><i class="fa-solid fa-chevron-left"></i></button>' +
            '  <div class="wxtp-title">主題</div>' +
            '  <span class="wxtp-head-pad"></span>' +
            '</div>' +
            '<div class="wxtp-scroll">' + body + '</div>' +
            '<div class="wxtp-bar">' +
            '  <button type="button" class="wxtp-bar-b" data-act="open-import"><i class="fa-solid fa-file-import"></i>匯入</button>' +
            '  <button type="button" class="wxtp-bar-b is-main" data-act="open-ai"><i class="fa-solid fa-wand-magic-sparkles"></i>請 AI 做一套</button>' +
            '</div>' + sheet;
    }

    function _onInput(e) {
        const f = e.target && e.target.dataset && e.target.dataset.f;
        if (!f) return;
        _draft[f] = e.target.value;
        if (f === 'text') {
            if (!_draft.name) { const n = _nameFromText(_draft.text); if (n) { _draft.name = n; const ni = _root.querySelector('[data-f="name"]'); if (ni) ni.value = n; } }
            _draft.foreign = false;
            const w = _root.querySelector('.wxtp-warn'); if (w) w.remove();
            const ok = _root.querySelector('[data-act="import-save"]'); if (ok) ok.disabled = !_draft.text.trim();
        }
    }

    async function _onClick(e) {
        const b = e.target && e.target.closest && e.target.closest('[data-act]');
        if (!b || !_root || !_root.contains(b)) return;
        const act = b.dataset.act, id = b.dataset.id;
        if (act === 'close') return close();
        if (act === 'use') { await apply(id || ''); _toast(id ? '已套用' : '回到原本的樣子'); return; }
        if (act === 'open-import') { _sheet = 'import'; _draft = { text: '', name: '', want: _draft.want, foreign: false }; return _renderPage(); }
        if (act === 'open-ai') { _sheet = 'ai'; return _renderPage(); }
        if (act === 'sheet-close') { _sheet = ''; return _renderPage(); }
        if (act === 'file') return _pickFile();
        if (act === 'import-save') return _importSave();
        if (act === 'convert') return _runAi(_draft.name ? ('照「' + _draft.name + '」這份的感覺') : '', _draft.text);
        if (act === 'ai-go') return _runAi(_draft.want, '');
        if (act === 'more') return _more(id);
    }

    function _pickFile() {
        const input = d.createElement('input');
        input.type = 'file';
        input.accept = '.css,.txt,.json,text/css,text/plain,application/json';
        input.className = 'wxtp-offscreen';
        d.body.appendChild(input);
        input.onchange = async function () {
            const f = input.files && input.files[0];
            input.remove();
            if (!f) return;
            if (f.size > MAX_CSS) { _toast('這個檔案太大了'); return; }
            try {
                const txt = await f.text();
                _draft.text = _cssFromAnything(txt);
                _draft.name = _draft.name || _nameFromText(txt) || f.name.replace(/\.[^.]+$/, '').slice(0, 30);
                _draft.foreign = false;
                _renderPage();
            } catch (err) { _toast('檔案讀不出來'); }
        };
        input.click();
    }

    async function _importSave() {
        const css = _cssFromAnything(_draft.text);
        const c = compile(css);
        if (!c.ok) { _toast(c.error); return; }
        if (!c.kept) { _toast('這份裡面沒有用得上的樣式'); return; }
        if (!c.ours) { _draft.foreign = true; _renderPage(); return; }
        const t = await add(_draft.name || _nameFromText(_draft.text), css, 'import');
        _sheet = '';
        await apply(t.id);
        _toast('已存成「' + t.name + '」並套用');
    }

    async function _runAi(want, ref) {
        if (_busy) return;
        _busy = true; _renderPage();
        try {
            const r = await generate(want, ref);
            const t = await add(r.name || (ref ? (_draft.name || '改寫的主題') : 'AI 做的主題'), r.css, 'ai');
            _busy = false; _sheet = '';
            await apply(t.id);
            _toast('做好了：「' + t.name + '」，已經套上');
        } catch (err) {
            _busy = false; _renderPage();
            _toast('沒做成：' + ((err && err.message) || err));
        }
    }

    // ⋯：改名／匯出（複製或存成檔案）／刪除
    function _more(id) {
        const t = (_list || []).find(function (x) { return x.id === id; });
        if (!t || !_root) return;
        const old = _root.querySelector('.wxtp-menu-mask'); if (old) old.remove();
        const m = d.createElement('div');
        m.className = 'wxtp-menu-mask';
        m.innerHTML = '<div class="wxtp-menu">' +
            '<div class="wxtp-menu-t">' + esc(t.name) + '</div>' +
            '<button type="button" data-m="rename"><i class="fa-solid fa-pen"></i>改名</button>' +
            '<button type="button" data-m="copy"><i class="fa-regular fa-copy"></i>複製分享</button>' +
            '<button type="button" data-m="file"><i class="fa-solid fa-file-export"></i>存成檔案</button>' +
            '<button type="button" data-m="del" class="is-danger"><i class="fa-solid fa-trash-can"></i>刪除</button>' +
            '<button type="button" data-m="x" class="is-cancel">取消</button>' +
            '</div>';
        _root.appendChild(m);
        m.addEventListener('click', async function (e) {
            const b = e.target.closest && e.target.closest('[data-m]');
            if (e.target === m || (b && b.dataset.m === 'x')) { m.remove(); return; }
            if (!b) return;
            const what = b.dataset.m;
            m.remove();
            if (what === 'rename') {
                const A = win.AUI || window.AUI;
                const n = (A && A.prompt) ? await A.prompt('新的名字', t.name) : (win.prompt ? win.prompt('新的名字', t.name) : '');
                if (n) await rename(id, n);
            } else if (what === 'copy') {
                _copy(exportText(t));
            } else if (what === 'file') {
                try {
                    const blob = new Blob([exportText(t)], { type: 'text/css' });
                    const a = d.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = String(t.name || '主題').replace(/[\\/:*?"<>|]/g, '') + '.css';
                    d.body.appendChild(a); a.click(); a.remove();
                    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
                } catch (err) { _toast('存不出來'); }
            } else if (what === 'del') {
                if (await _confirm('刪掉「' + t.name + '」？')) await remove(id);
            }
        });
    }
    // 🚨 酒館殼裡 clipboard 會非同步失敗、try/catch 抓不到：接 then 的失敗那條再退回 execCommand
    function _copy(text) {
        const fallback = function () {
            try {
                const ta = d.createElement('textarea');
                ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'wxtp-offscreen';
                d.body.appendChild(ta); ta.select();
                const ok = d.execCommand('copy'); ta.remove();
                _toast(ok ? '已複製，貼給朋友就能匯入' : '複製不了');
            } catch (e) { _toast('複製不了'); }
        };
        const nav = win.navigator || navigator;
        if (nav && nav.clipboard && nav.clipboard.writeText) { nav.clipboard.writeText(text).then(function () { _toast('已複製，貼給朋友就能匯入'); }, fallback); return; }
        fallback();
    }

    // 開機時把正在用的那套套上
    async function _boot() {
        const id = activeId();
        if (!id) return;
        const db = _db();
        if (!db || !db.getAppData) { setTimeout(_boot, 1000); return; }
        await apply(id);
    }

    const API = { compile, load, apply, add, rename, remove, activeId, open, close, generate, exportText };
    win.WX_THEME_PACK = API;
    window.WX_THEME_PACK = API;
    setTimeout(function () { _boot().catch(function (e) { console.warn('[主題] 開機套用失敗', e); }); }, 800);
})();
