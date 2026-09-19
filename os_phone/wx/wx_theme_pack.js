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
    // 語音訊息（.wx-vmsg，含點開的轉文字）畫在泡泡裡面、底色是泡泡的 → 算泡泡
    const BUBBLE_RE = /pbub-(?:bubble|row|me|other|wrap)\b|wx-bubble-(?:content|wrap|bare)\b|wx-msg-row\b|wx-typing|chat-bubble\b|chat-row\b|wx-vmsg/i;
    const BUBBLE_VAR_RE = /^--(?:pbub-|wx-bubble-)/i;
    // 不准加樣式的那層：個人檔案卡中間放頭像＋名字＋簽名的那塊，本來就是直接疊在背景照片上，
    //   主題每次都給它加框加底，看起來像一張卡片擋住照片（她 09-19）。只擋「那一層本身」，它裡面的頭像、名字照樣能改。
    //   頭像外圈 .wxpf-ring 同理：它只佔位子，形狀與框都畫在頭像本身，主題寫外圈就會多套一個形狀（她：圈套圈）
    const NOSTYLE_RE = /\.wxpf-(?:main|ring)(?![\w-])/i;
    function _isNoStyle(sel) {
        const last = String(sel).trim().split(/\s*[\s>+~]\s*/).pop();
        return NOSTYLE_RE.test(last);
    }
    // 弄不見就回不去的那些
    const PROTECT_RE = /wx-(?:shell|header|back-btn|icon-btn|footer-wrapper|input-(?:bar|box|real)|send-btn|plus-btn|bottom-nav|tab|page-container|page-room|page-list|room-scroll|modal-box|rp-box|rp-close|transfer-box|receipt-box|receipt-close|context-menu|vsheet|btn-(?:confirm|cancel|receive|return))\b|ws-(?:overlay|header|close|body|footer|btn-save)\b|wxto-|wxnb-|wxmo-|wxpf-|wxwal-/i;
    // 聊天室裡的卡片（轉帳、紅包、禮物、位置、影片、檔案、連結、收款碼、分享、語音、通話、外送）：跟著主題換長相，
    //   但金額、狀態字（已收款、已領完、已過期）不准被藏掉——她點下去要知道收了沒
    const CARD_RE = /wx-(?:tf-|rpc-|gift-|loc-|vcard|file-|link-|receive-|wb-share-|app-share-|call-rec)|wxto-card/i;
    const ROOT_RE = /^\s*(?::root|html|body)\s*$/i;
    // 🚨 頭像是一張照片，放在元素自己的背景圖上。主題寫 background 就會把照片整個蓋掉
    //    （她套的第一套：頭像全變成黃色六角形）。頭像只准改形狀、框、陰影、大小，背景那兩句拿掉。
    const AVATAR_RE = /wx-(?:avatar|bubble-avatar|me-avatar|rp-avatar|rp-item-avatar)\b|pbub-avatar\b|ws-avatar-circle\b|wxpf-(?:bg|avatar)\b|wxmo-(?:av|av-lg|av-xs|cover-img)\b/i;
    // 🚨 標題字太大會擠成兩行、壓到返回鈕（她截圖：群名兩行疊在「微信」上）：超過就壓回上限
    const TITLE_RE = /wx-header-title\b|ws-title\b|wx-modal-title\b|wx-name\b|wx-contact-name\b|wx-me-name\b/i;
    const TITLE_MAX_PX = 20;
    // 🚨 每頁最上面那條要往上長到手機狀態列底下（時間、電池坐在它自己的顏色上）。
    //    主題寫了自己的高度／上內距就把讓出來那塊吃掉 → 返回鈕、圖示鈕被壓到狀態列底下（她截圖）。
    //    主題照「不含狀態列」那塊寫，這裡替它把狀態列加回去。只認那條本身，不認它裡面的東西。
    const TOPBAR_RE = /\.(?:wx-header|ws-header|wxmo-bar|wxnb-head|wxnb-edit-bar|wxto-head|wxwal-head)(?![\w-])/i;
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
    // 裝飾層（::before／::after）：AI 用它畫塗鴉、網格、條紋。它預設疊在零件的內容上面，
    //   蓋住標題和按鈕、還把點擊吃掉（她：header 的 svg 塗鴉在標題和按鈕前面；網格條紋放在字和按鈕前面點不了）。
    //   一律壓到那個零件的內容底下（z-index -1，零件自己設 isolation 當一層，所以圖案還在它的底色上面）、不接點擊。
    const PSEUDO_RE = /::?(?:before|after)\s*$/i;
    function _scopeList(sels) {
        const out = [];
        sels.forEach(function (sel) {
            if (ROOT_RE.test(sel)) { out.push('.wx-shell', '.wx-shell ~ *'); return; }   // 變數寫在最外層＝外殼與它旁邊那幾層都吃得到
            if (/^\.wx-shell\b/.test(sel)) { out.push(sel); return; }                       // 本來就從外殼開始寫
            // 在外殼裡／外殼旁邊那一層本身／外殼旁邊那一層裡面
            out.push('.wx-shell ' + sel, '.wx-shell ~ ' + sel, '.wx-shell ~ * ' + sel);
        });
        return out;
    }
    function _scopeRule(selText, cssText) {
        const sels = _splitTop(String(selText || ''), ',').map(function (s) { return s.trim(); }).filter(Boolean)
            .filter(function (sel) { return !BUBBLE_RE.test(sel) && !_isNoStyle(sel); });
        if (!sels.length) return '';
        const plain = sels.filter(function (sel) { return !PSEUDO_RE.test(sel); });
        const deco = sels.filter(function (sel) { return PSEUDO_RE.test(sel); });
        const parts = [];
        if (plain.length) {
            const d1 = _cleanDecls(cssText, plain.join(','));
            if (d1) parts.push(_scopeList(plain).join(',\n') + ' { ' + d1 + '; }');
        }
        if (deco.length) {
            let d2 = _cleanDecls(cssText, deco.join(','));
            if (d2) {
                d2 = _splitTop(d2, ';').filter(function (x) { return !/^\s*(?:z-index|pointer-events)\s*:/i.test(x); }).join('; ');
                parts.push(_scopeList(deco).join(',\n') + ' { ' + (d2 ? d2 + '; ' : '') + 'z-index: -1 !important; pointer-events: none !important; }');
                const hosts = deco.map(function (sel) { return sel.replace(PSEUDO_RE, '').trim(); }).filter(function (h) { return h && !ROOT_RE.test(h); });
                if (hosts.length) parts.push(_scopeList(hosts).join(',\n') + ' { isolation: isolate; }');
            }
        }
        return parts.join('\n');
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
        '.wx-shell :is(.fa-brands,.fab):not(#_), .wx-shell ~ * :is(.fa-brands,.fab):not(#_) { font-family: "Font Awesome 6 Brands" !important; font-weight: 400 !important; font-style: normal !important; }'
    ].join('\n');

    // 列表頁、聊天室頁自己鋪了一層底色（白、淺灰）。AI 的主題常只換外殼和每一列，沒寫這兩頁 →
    //   聊天少的時候下面空出來那一大塊還是白的（她：每次生成主頁底部都是白色，感覺都沒套用）。
    //   主題沒寫這兩頁、也沒改那兩個顏色格子時，這兩頁不畫底，透出外殼的底色。主題有寫就照主題。
    function _pageFill(css) {
        const out = [];
        // 列表頁本身＋裡面那層鋪底（.wx-page-fill），「我」那頁（.wx-me-page、.wx-page-fill.is-page）與聊天室各看各的
        if (!/wx-page-list|wx-page-fill|--wx-surface\s*:/.test(css)) out.push('.wx-shell :is(.wx-page-list, .wx-page-fill:not(.is-page)):not(#_) { background: transparent !important; }');
        if (!/wx-me-page|wx-page-fill|--wx-page\s*:/.test(css)) out.push('.wx-shell :is(.wx-me-page, .wx-page-fill.is-page):not(#_) { background: transparent !important; }');
        if (!/wx-page-room|--wx-page\s*:/.test(css)) out.push('.wx-shell .wx-page-room:not(#_) { background: transparent !important; }');
        return out.join('\n');
    }

    // 疊在外殼旁邊的整頁（記事本）有自己的一組顏色；套主題時改接顏色表，主題單獨寫它的時候照主題
    //   （div.xxx 比記事本自己的 .xxx 重、比主題的 .wx-shell ~ .xxx 輕）
    //   整頁上的字接 --wx-page-ink，卡片與編輯頁（卡片那塊底）接 --wx-ink：黑整頁＋白卡片的主題，兩種字本來就要不同色（她 09-19 記事本黑底黑字）
    const PANEL_PALETTE = 'div.wxnb-root { --wxnb-bg: var(--wx-page); --wxnb-ink: var(--wx-page-ink, var(--wx-ink)); --wxnb-card-ink: var(--wx-ink); --wxnb-edit: var(--wx-surface); --wxnb-well: var(--wx-surface-2); }\n'
        // 設置頁的分組小標（頭像／隱私／外觀／數據管理）不在卡片裡，直接坐在整頁底上
        + 'div.wx-set-head { color: color-mix(in srgb, var(--wx-page-ink, var(--wx-ink-3)) 70%, transparent); }\n'
        // 外送整頁同一個道理：整頁的字、卡片上的字、重點色（原本的琥珀色）都接顏色表
        + 'div.wxto-root { --wxto-bg: var(--wx-page); --wxto-ink: var(--wx-page-ink, var(--wx-ink)); --wxto-card: var(--wx-surface); --wxto-card-ink: var(--wx-ink); --wxto-amber: var(--wx-accent); --wxto-amber-deep: var(--wx-accent-ink, var(--wx-accent)); --wxto-on-amber: var(--wx-on-accent); }\n'
        // 聊天室裡的訂單卡：同一組名字，卡片底、字、重點色接顏色表（主題單獨寫 .wxto-card 的底時，字記得一起寫）
        + 'div.wxto-card { --wxto-card: var(--wx-surface); --wxto-card-ink: var(--wx-ink); --wxto-amber: var(--wx-accent); --wxto-amber-lite: var(--wx-accent); --wxto-amber-deep: var(--wx-accent); --wxto-amber-ink: var(--wx-accent-ink, var(--wx-accent)); --wxto-on-amber: var(--wx-on-accent); }\n'
        // 餘額那顆坐在整頁底上，不是卡片上：用重點色本身，別用給卡片的深一階
        + 'div.wxto-root .wxto-bal { color: var(--wx-accent); }\n'
        // 朋友圈封面的名字與頭像一半凸出去、壓在內容上：主題給內容加了底或定位也不能把它蓋掉（她 09-19）
        + '.wxmo-root .wxmo-cover:not(#_) { position: relative !important; z-index: 2 !important; }';

    function _inject(css) {
        let st = d.getElementById(STYLE_ID);
        if (!css) { if (st) st.remove(); return; }
        css = css + '\n' + SAFETY + '\n' + _pageFill(css) + '\n' + PANEL_PALETTE;
        if (!st) { st = d.createElement('style'); st.id = STYLE_ID; }
        // 永遠排在 head 最後：主題要壓過 app 自己的樣式
        (d.head || d.documentElement).appendChild(st);
        st.textContent = css;
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
        '輸入列：整條 .wx-footer-wrapper；.wx-input-bar；打字框外框 .wx-input-box；打字框 .wx-input-real；送出 .wx-send-btn；加號 .wx-plus-btn；表情包鈕 .wx-sticker-btn；左邊叫他回覆的魔杖鈕 .wx-trigger-btn。表情包鈕和加號預設跟著 .wx-input-bar 的 color 走',
        '聊天室裡的卡片（跟著主題換長相）：轉帳 .wx-tf-card（已收款多 .is-ok，退回或過期多 .is-back），圖示圈 .wx-tf-icon，標題 .wx-tf-title，小字 .wx-tf-sub；紅包 .wx-rpc-card（領完多 .is-empty），上半 .wx-rpc-top，紅包袋 .wx-rpc-env，袋上的圓 .wx-rpc-coin，祝福語 .wx-rpc-memo，狀態 .wx-rpc-sub，下緣 .wx-rpc-foot；禮物 .wx-gift-card-blue，上半 .wx-gift-top，圖示 .wx-gift-icon-gold，字 .wx-gift-title-text，下緣 .wx-gift-footer；位置 .wx-loc-card，地圖 .wx-loc-map，圖釘 .wx-loc-pin，下半 .wx-loc-info，地名 .wx-loc-name，地址 .wx-loc-addr；影片 .wx-vcard，播放鈕 .wx-vcard-play，標題 .wx-vcard-title，時長 .wx-vcard-dur；檔案 .wx-file-card，檔名 .wx-file-name，大小 .wx-file-size；連結 .wx-link-msg，標題 .wx-link-title，下緣 .wx-link-foot，右邊縮圖 .wx-link-thumb；收款碼 .wx-receive-msg，上緣 .wx-receive-head，碼 .wx-receive-qr，金額 .wx-receive-amt，下緣 .wx-receive-foot；微博分享 .wx-wb-share-card；其他 app 分享 .wx-app-share-card；外送單 .wxto-card，上緣 .wxto-card-hd，店名 .wxto-card-shop，品項 .wxto-card-items，金額 .wxto-card-amt，下緣 .wxto-card-ft',
        '加號打開的功能面板：.wx-action-panel；每個功能 .wx-grid-item；圖示 .wx-grid-icon；字 .wx-grid-label；翻頁點 .wx-dot（目前那頁多 .active）',
        '通訊錄：分區 .wx-contact-section；每個人 .wx-contact-item；名字 .wx-contact-name；圖示 .wx-contact-icon',
        '「我」那頁上方：.wx-me-header；頭像 .wx-me-avatar；名字 .wx-me-name；帳號 .wx-me-id；簽名 .wx-me-signature',
        '一格一格的清單（設置、「我」）：一組 .wx-cell-group；每格 .wx-cell；左邊圖示 .wx-cell-icon；字 .wx-cell-text；右邊箭頭 .wx-cell-arrow；分組小標（在整頁底上，吃 --wx-page-ink）.wx-set-head；說明字 .wx-set-desc',
        '彈出小窗：遮罩 .wx-modal-overlay；窗 .wx-modal-box（裡面的標題、說明字都跟著它的 color）；標題 .wx-modal-title；欄位名 .wx-modal-label；輸入框 .wx-modal-input；取消 .wx-btn-cancel；確定 .wx-btn-confirm',
        '聊天室裡點卡片開出來的小窗（都浮在一層半透明黑上，每個小窗裡的字預設跟著那個小窗自己的 color，換小窗的底就同一條寫 color）：紅包明細 .wx-rp-box（上半那塊 .wx-rp-header，發的人 .wx-rp-sender，祝福語 .wx-rp-memo；下半：總金額／已領／剩餘三個數字 .wx-rp-stat，領的人每一筆 .wx-rp-item，名字 .wx-rp-item-name，時間 .wx-rp-item-time，金額 .wx-rp-item-amount，關閉 .wx-rp-close）；轉帳 .wx-transfer-box（上半 .wx-transfer-header，裡面的圈 .wx-transfer-icon 與金額 .wx-transfer-amount；下半按鈕區 .wx-transfer-actions，確認收款 .wx-btn-receive，退回 .wx-btn-return，小字 .wx-transfer-note）；禮物收據 .wx-receipt-box（品名 .wx-receipt-name，價錢 .wx-receipt-price，收下 .wx-receipt-btn-accept，婉拒 .wx-receipt-btn-refuse，關閉 .wx-receipt-close）；選單 .wx-context-menu，每一項 .wx-context-item；從底部升起的面板 .wx-vsheet（標題 .wx-vsheet-title）。長按訊息跳出的那條黑色小選單與右上加號選單是固定的深色，不用做',
        '記事本（聊天室右上角那本書點開的整頁）：整頁 .wxnb-root；上方 .wxnb-head，返回 .wxnb-back，標題 .wxnb-title，副標 .wxnb-sub；搜尋框 .wxnb-search；卡片牆 .wxnb-grid；每張卡 .wxnb-card（標題 .wxnb-card-t、內文 .wxnb-card-b、下緣 .wxnb-card-f、照片 .wxnb-card-ph）；右下新增鈕 .wxnb-fab；沒有東西時 .wxnb-empty；編輯頁 .wxnb-edit（整頁吃 --wx-page-ink，卡片與編輯頁吃 --wx-ink），上方列 .wxnb-edit-bar，內文 .wxnb-edit-body，完成 .wxnb-edit-ok，關閉 .wxnb-edit-x',
        '個人檔案卡（點頭像開出來的整屏）：整張 .wxpf-root（鋪底的是這個人自己的背景照片 .wxpf-bg，不要蓋掉）；照片上的暗層 .wxpf-scrim；頭像 .wxpf-avatar（只有這一層：形狀、框、陰影都寫在它身上，外面沒有另一圈）；名字 .wxpf-name；簽名 .wxpf-bio（頭像、名字、簽名是直接疊在照片上的，外面不會有框或底）；底下一排動作鈕 .wxpf-acts（發訊息、記事本等三四顆），每顆 .wxpf-act（含下面那行字），按鈕的樣子（底、框、形狀）寫在圖示那一格 .wxpf-act-ic——這排按鈕一定要做成這套風格；關閉 .wxpf-x',
        '朋友圈（整頁）：整頁 .wxmo-root；頂列 .wxmo-bar（蓋在封面上時是透明的，往下捲之後 .wxmo-root 多一個 .is-scrolled，要寫實心的樣子就寫 .wxmo-root.is-scrolled .wxmo-bar），頂列按鈕 .wxmo-bar-btn，標題 .wxmo-bar-t；封面 .wxmo-cover（封面照片 .wxmo-cover-img 不要蓋掉），封面上的名字 .wxmo-cover-name；每一則 .wxmo-post，頭像 .wxmo-av，名字 .wxmo-name，內文 .wxmo-text，照片 .wxmo-photos，時間 .wxmo-time，右邊的更多鈕 .wxmo-more；讚與留言那一塊 .wxmo-social，讚 .wxmo-likes，每則留言 .wxmo-cm；留言輸入 .wxmo-input，送出 .wxmo-send；發一則的頁 .wxmo-compose，上方列 .wxmo-compose-bar，輸入 .wxmo-compose-in，發表 .wxmo-compose-ok，關閉 .wxmo-compose-x',
        '錢包（「我」→ 錢包，整頁）：整頁 .wxwal-page；上方列 .wxwal-head，返回 .wxwal-back，標題 .wxwal-title；餘額那張卡 .wxwal-card（金額 .wxwal-card-num）；分區小標 .wxwal-sec；明細清單 .wxwal-list，每筆 .wxwal-row（圖示 .wxwal-ico，說明 .wxwal-why，時間 .wxwal-when，金額 .wxwal-amt，進帳的多 .wxwal-in）',
        '外送（聊天室加號 → 外送，整頁）：整頁 .wxto-root；上方 .wxto-head，返回 .wxto-back，標題 .wxto-title，餘額 .wxto-bal；點給他／請他付的切換 .wxto-seg，每顆 .wxto-seg-b（選中多 .is-on）；一排店 .wxto-shops，每家 .wxto-shop（選中多 .is-on）；菜單 .wxto-dishes，每道 .wxto-dish，價錢 .wxto-dish-p，加減鈕 .wxto-step-q；找店與加菜的按鈕 .wxto-find、.wxto-add；最底下結帳列 .wxto-bar，結帳鈕 .wxto-go',
        '聊天設置（從聊天室右上角進去那一層）：.ws-overlay；標頭 .ws-header；標題 .ws-title；關閉 .ws-close；內容 .ws-body；一組 .ws-group；每格 .ws-cell；字 .ws-label；輸入框 .ws-input；開關 .ws-switch；頭像圓框 .ws-avatar-circle；疊在頭像上的相機 .ws-avatar-icon；底部 .ws-footer；保存 .ws-btn-save'
    ];
    // 🎨 顏色表：整支 app 沒被主題單獨寫到的地方都吃這幾格（按鈕、選中的分頁、開關、送出、卡片、各頁的底與字）。
    //   以前只在說明裡提一句「寫在 :root 會一起換」，AI 忙著設計零件常常沒寫 → 沒碰到的全留在預設的微信綠
    //   （她：Persona5 紅黑白變綠黑白、晨報風按鈕符號綠色）。現在要它先交一張固定格式的顏色表，缺了就叫它補。
    const PALETTE = [
        ['--wx-page', '整頁的底（聊天列表、設置頁、聊天室）', 1],
        ['--wx-surface', '卡片與每一列的底', 1],
        ['--wx-header', '每頁最上面那條的底', 1],
        ['--wx-bar', '底部分頁列與輸入列的底', 1],
        ['--wx-ink', '卡片與每一列上的主要字（標題、名字）', 1],
        ['--wx-ink-3', '卡片與每一列上的次要字（最後一句、說明）', 1],
        ['--wx-page-ink', '直接寫在整頁底上、不在卡片裡的字（設置的分組小標、記事本那一整頁）。整頁底跟卡片底一深一淺時，這格要跟 --wx-ink 相反', 1],
        ['--wx-header-ink', '最上面那條上的字與符號（標題、返回、右上角的圖示鈕）。要在 --wx-header 上看得清楚', 1],
        ['--wx-bar-ink', '輸入列上的符號（表情、加號）。要在 --wx-bar 上看得清楚', 1],
        ['--wx-accent', '重點色：按鈕、選中的分頁、開關、送出、未讀以外的強調', 1],
        ['--wx-on-accent', '疊在重點色上面的字', 1],
        ['--wx-surface-2', '輸入框、按下去的底', 0],
        ['--wx-line', '分隔線', 0],
        ['--wx-ink-2', '內文', 0],
        ['--wx-ink-dim', '時間、最淡的說明', 0],
        ['--wx-accent-ink', '重點色當字用時（要在卡片底上看得清楚）', 0],
        ['--wx-link', '可以點的字', 0],
        ['--wx-fill', '沒有圖時頭像的底', 0]
    ];
    const VARS = PALETTE.map(function (x) { return x[0] + ' ' + x[1]; }).join('、');
    // AI 回的顏色表 → :root 一塊；沒寫的從寫了的推（淺一階、深一階那種），核心那幾格缺了回傳 missing 讓它補
    function _paletteCss(text) {
        const got = {};
        String(text || '').split(/[\n;；]+/).forEach(function (ln) {
            const m = ln.match(/(--wx-[a-z0-9-]+)\s*[:：]\s*([^\n;；]+)/i);
            if (!m) return;
            const v = m[2].replace(/!important/i, '').trim();
            if (v && !/[{}<>]|url\(|expression/i.test(v)) got[m[1].toLowerCase()] = v;
        });
        const missing = PALETTE.filter(function (x) { return x[2] && !got[x[0]]; }).map(function (x) { return x[0]; });
        const pick = function (k, alt) { return got[k] || alt; };
        const v = Object.assign({}, got);
        v['--wx-surface-2'] = pick('--wx-surface-2', got['--wx-surface']);
        v['--wx-line'] = pick('--wx-line', got['--wx-ink-3'] ? 'color-mix(in srgb, ' + got['--wx-ink-3'] + ' 25%, transparent)' : undefined);
        v['--wx-line-strong'] = pick('--wx-line-strong', v['--wx-line']);
        v['--wx-ink-2'] = pick('--wx-ink-2', got['--wx-ink']);
        v['--wx-page-ink'] = pick('--wx-page-ink', got['--wx-ink']);
        v['--wx-ink-soft'] = pick('--wx-ink-soft', got['--wx-ink-3']);
        v['--wx-ink-dim'] = pick('--wx-ink-dim', got['--wx-ink-3']);
        v['--wx-arrow'] = pick('--wx-arrow', v['--wx-ink-dim']);
        v['--wx-accent-ink'] = pick('--wx-accent-ink', got['--wx-accent']);
        v['--wx-link'] = pick('--wx-link', v['--wx-accent-ink']);
        v['--wx-fill'] = pick('--wx-fill', v['--wx-surface-2']);
        v['--wx-fill-2'] = pick('--wx-fill-2', v['--wx-fill']);
        const body = Object.keys(v).filter(function (k) { return v[k]; }).map(function (k) { return '  ' + k + ': ' + v[k] + ';'; }).join('\n');
        return { css: body ? ':root {\n' + body + '\n}' : '', missing: missing };
    }


    // 🔲 放符號／字的格子：裡面的符號吃的是「這一格自己的 color」。
    //   從她存的幾套真主題撈出來看，AI 每次都替這種格子寫了底、同一條卻沒寫 color（.wx-grid-icon、.wxpf-act-ic、.wx-tf-icon 全是），
    //   符號留在原本的顏色 → 白格白符號、黑格深灰符號（她：「那該死的按鈕符號」）。
    //   說明裡講過「底色字色同一條寫」它照樣漏，所以改成交稿後逐格檢查：寫了底沒寫符號色的，列出來叫它補（顏色由它挑，程式不替它換色）。
    const PAIRED = [
        ['.wx-grid-icon', '加號面板每個功能的格子，裡面是功能的符號', '.wx-grid-item'],
        ['.wxpf-act-ic', '個人檔案卡動作鈕的格子，裡面是符號', '.wxpf-act'],
        ['.wx-cell-icon', '設置與「我」那頁每格左邊的圖示（它有自己的顏色，不跟著那一格的字色）'],
        ['.wx-contact-icon', '通訊錄每一列左邊的圖示格，裡面是符號'],
        ['.wx-tf-card', '轉帳卡，裡面的 ¥ 圈、標題、小字'],
        ['.wx-tf-icon', '轉帳卡的 ¥ 圈'],
        ['.wx-rpc-top', '紅包卡上半，裡面的祝福語與狀態'],
        ['.wx-rpc-foot', '紅包卡下緣的字'],
        ['.wx-rpc-coin', '紅包袋上的圓，裡面是 ¥'],
        ['.wx-gift-top', '禮物卡上半，裡面的圖示與字'],
        ['.wx-gift-footer', '禮物卡下緣的字'],
        ['.wx-loc-info', '位置卡下半，地名與地址'],
        ['.wx-vcard-play', '影片卡的播放鈕，裡面是三角形'],
        ['.wx-file-card', '檔案卡，檔名與大小'],
        ['.wx-link-msg', '連結卡，標題與下緣'],
        ['.wx-receive-head', '收款碼卡上緣的字'],
        ['.wx-receive-foot', '收款碼卡下緣的字'],
        ['.wx-modal-box', '彈出小窗，裡面的標題與說明字'],
        ['.wx-rp-box', '紅包明細小窗下半，三個數字與領的人每一筆'],
        ['.wx-rp-header', '紅包明細小窗上半，發的人與祝福語'],
        ['.wx-transfer-box', '轉帳小窗下半的小字'],
        ['.wx-transfer-header', '轉帳小窗上半，圈、狀態字與金額'],
        ['.wx-btn-receive', '轉帳小窗的確認收款鈕上的字'],
        ['.wx-btn-return', '轉帳小窗的退回鈕上的字'],
        ['.wx-receipt-box', '禮物收據小窗，品名與說明字'],
        ['.wx-receipt-btn-accept', '禮物收據的收下鈕上的字'],
        ['.wx-receipt-btn-refuse', '禮物收據的婉拒鈕上的字'],
        ['.wx-context-menu', '選單，每一項的字'],
        ['.wx-context-item', '選單每一項的字'],
        ['.wx-vsheet', '從底部升起的面板，標題與說明字'],
        ['.wx-icon-btn', '標頭與輸入列的圖示鈕，裡面是符號'],
        ['.wx-back-btn', '返回鈕的符號'],
        ['.wx-plus-btn', '輸入列的加號'],
        ['.wx-sticker-btn', '輸入列的表情包鈕'],
        ['.wx-trigger-btn', '輸入列的魔杖鈕'],
        ['.wx-send-btn', '送出鍵上的字'],
        ['.wx-btn-confirm', '小窗的確定鈕上的字'],
        ['.wx-btn-cancel', '小窗的取消鈕上的字'],
        ['.ws-btn-save', '聊天設置的保存鈕上的字'],
        ['.ws-close', '聊天設置的關閉鈕'],
        ['.wxnb-fab', '記事本右下的新增鈕，裡面是符號'],
        ['.wxnb-head-btn', '聊天室右上的記事本鈕'],
        ['.wx-head-menu-btn', '聊天室右上的選單鈕'],
        ['.wxmo-bar-btn', '朋友圈頂列的按鈕，裡面是符號'],
        ['.wxpf-x', '個人檔案卡的關閉鈕'],
        ['.wxwal-ico', '錢包每筆明細左邊的圖示格'],
        ['.wxwal-card', '錢包餘額那張卡上的字'],
        ['.wxto-go', '外送結帳鈕上的字'],
        ['.wxto-find', '外送找店鈕'],
        ['.wxto-add', '外送加菜鈕']
    ];
    function _partRe(name, tail) { return new RegExp(name.replace(/\./g, '\\.') + '(?![\\w-])[^\\s>+~]*' + tail + '$', 'i'); }
    // 回傳寫了底、卻沒有任何一條替它寫 color 的格子名。hover／按下去那種狀態不算。
    function _unpaired(css) {
        const Sheet = win.CSSStyleSheet || window.CSSStyleSheet;
        let sheet;
        try { sheet = new Sheet(); sheet.replaceSync(String(css || '').replace(/@import[^;]*;/gi, '')); } catch (e) { return []; }
        const hasBg = {}, hasInk = {};
        // 最後一段就是這一格 → 'self'；這一格後面只跟著它裡面的符號（i、svg、span、path、*）→ 'glyph'
        const GLYPH = '(?:\\s*>?\\s*(?:i|svg|span|path|\\*)[^\\s>+~]*)+';
        const walk = function (rules) {
            for (let i = 0; i < rules.length; i++) {
                const r = rules[i];
                if (r.selectorText != null) {
                    const body = _ruleBody(r);
                    const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*(?!(?:none|transparent|inherit|initial|unset)\b)/i.test(body);
                    const ink = /(?:^|;)\s*(?:color|fill)\s*:/i.test(body);
                    if (!bg && !ink) continue;
                    _splitTop(r.selectorText, ',').forEach(function (sel) {
                        sel = String(sel || '').trim();
                        if (/::?(?:before|after)\s*$/i.test(sel)) return;                 // 裝飾層的底不算這一格的底
                        if (/:(?:hover|active|focus|disabled)/i.test(sel)) return;
                        PAIRED.forEach(function (x) {
                            const self = _partRe(x[0], '').test(sel);
                            if (bg && (self || (x[2] && _partRe(x[2], '').test(sel)))) hasBg[x[0]] = 1;   // x[2]＝包著它的那層：底寫在外層，符號一樣要跟著換
                            if (ink && (self || _partRe(x[0], GLYPH).test(sel))) hasInk[x[0]] = 1;
                        });
                    });
                } else if (r.cssRules && r.name == null) walk(r.cssRules);
            }
        };
        walk(sheet.cssRules);
        return PAIRED.map(function (x) { return x[0]; }).filter(function (p) { return hasBg[p] && !hasInk[p]; });
    }
    // 叫它把漏掉的符號色補上：回傳要接在主題後面的幾條樣式（補不成就回空字串，主題照存）
    function _askInk(themeText, parts) {
        return new Promise(function (resolve) {
            const O = win.OS_API || window.OS_API;
            if (!parts.length || !O || !O.chatMain) { resolve(''); return; }
            const desc = {}; PAIRED.forEach(function (x) { desc[x[0]] = x[1]; });
            const ask = [
                { role: 'system', content: '你替一支手機聊天 app 設計了一套主題。下面列的幾個零件，你換了它的底色，卻沒寫它裡面的符號／字的顏色——它們還留在原本的顏色，很可能跟你的新底撞在一起看不到。照那套主題的風格，替每一個挑一個在它的新底上看得清楚的顏色。只輸出 <ink> 那一塊，一行一個寫成 零件名: 顏色，不要寫別的字。' },
                { role: 'user', content: '那套主題：\n' + String(themeText).slice(0, 14000) + '\n\n要補的零件：\n' + parts.map(function (p) { return '・' + p + '（' + desc[p] + '）'; }).join('\n') }
            ];
            O.chatMain(ask, null, function (t2) {
                const s = String(t2 || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
                const m = s.match(/[<＜]\s*ink\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*ink\s*[>＞]/i);
                const out = [];
                (m ? m[1] : s).split(/\n+/).forEach(function (ln) {
                    const k = ln.match(/(\.[a-z][\w-]*)\s*[:：]\s*([^\n;；]+)/i);
                    if (!k || parts.indexOf(k[1]) < 0) return;
                    const v = k[2].replace(/!important/i, '').trim();
                    if (!v || /[{}<>]|url\(|expression/i.test(v)) return;
                    out.push(k[1] + ' { color: ' + v + ' !important; }');
                });
                resolve(out.length ? '\n/* 格子裡的符號 */\n' + out.join('\n') : '');
            }, function () { resolve(''); }, { task: 'wx_theme', label: '聊天 app 主題（補符號顏色）' });
        });
    }

    function _aiMessages(want, ref) {
        const sys = [
            '你替一支手機聊天 app 設計「主題」：一整包 CSS，換掉整支 app 的長相。',
            '主題不只是換顏色：要動到形狀（圓角、邊框、陰影）、間距與密度、字型與字級字重、背景（漸層、紋理）、標頭與分頁列與輸入列的造型、清單的排法、圖示的樣子。整體要看得出是一種風格，而不是同一個版面換了顏色。',
            '',
            '分兩步做：',
            '第一步：整套顏色（一定要全填，這是最重要的一步）。整支 app 裡你沒有單獨寫到的零件，全部吃這張表：按鈕、選中的分頁、開關、送出鍵、卡片、各頁的底與字。沒填的格子會留在原本的微信綠與白，整套主題就會看起來沒換。格子：',
            PALETTE.map(function (x) { return '・' + x[0] + '：' + x[1] + (x[2] ? '（必填）' : ''); }).join('\n'),
            '重點色要照這套風格挑，字和它底下的底色要看得清楚。',
            '',
            '第二步：造型。挑最能表現風格的幾樣做（標頭、分頁列、輸入列、列表、卡片的形狀與裝飾），不用每個零件都寫；沒寫到的會用第一步的顏色。零件（只能用這些名字）：',
            PARTS.map(function (p) { return '・' + p; }).join('\n'),
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
            '・放符號的格子（加號面板的 .wx-grid-icon、個人檔案卡的 .wxpf-act-ic、清單左邊的 .wx-cell-icon、通訊錄的 .wx-contact-icon、轉帳卡的 .wx-tf-icon、各種圖示鈕）：格子裡面有一個符號，符號的顏色就是這一格自己的 color。替這種格子寫 background 的那一條，一定同時寫 color；只寫底，符號會留在原本的顏色，白格子裡是白符號、黑格子裡是深灰符號，整顆按鈕看起來是空的。',
            '・每一塊的底色和字色寫在同一條：這支 app 裡每塊的字都跟著那一塊的 color 走，小字只是半透明，不會另外指定灰色。',
            '・用 ::before／::after 畫的裝飾（塗鴉、網格、條紋、光暈）一律會被放在那個零件的內容底下、點不到，當背景圖案設計就好，不要拿它放要讓人看的字。',
            '・聊天室裡的卡片要跟整套風格一致，但每一種都要一眼認得出是什麼（紅包還是紅包、轉帳還是轉帳）；換了卡片哪一塊的底色，同一條就要把那塊的字色一起寫，卡片裡的標題、小字、金額才看得清楚（有些卡片的字原本是白色）；金額、店名、狀態字要清楚；已收款、退回、領完這幾種要跟還沒處理的看得出不同。檔案圖示 .wx-file-icon 的底色代表檔案種類，不要改。',
            '・不要把任何東西藏起來、弄透明、弄得點不到；不要用 position: fixed；寬高不要用螢幕單位（vw、vh）。',
            '・這支 app 自己的樣式有不少寫在元素身上，要蓋過它們就加 !important。',
            '・整支 app 的底色或紋理寫在 .wx-shell；聊天列表頁 .wx-page-list、「我」那頁 .wx-me-page 與聊天室 .wx-page-room 沒另外寫底色時會透出它。只換每一列的底、沒寫整頁，列表下面空的那塊就會是別的顏色。',
            '・每一頁都要設計到，不能只做聊天列表：通訊錄的每個人、「我」那頁與設置的每一格（.wx-cell-group、.wx-cell）、聊天室、輸入列、記事本、朋友圈、個人檔案卡、聊天設置，漏掉的那頁會維持原本的白底，看起來像沒套用。',
            '・字型只能從 Google Fonts 用 @import 引入，其他外部檔案不要用。按鈕上的小圖示是另一套圖示字型畫的，字型只換文字就好，不要寫成全部元素（*）一起換。',
            '・深色與淺色：做成一套固定的樣子就好，不用另外寫夜晚版。',
            '',
            '輸出格式固定，標籤名照抄英文，除此之外不要寫任何字：',
            '<palette>',
            '一行一格，寫成 格子名: 顏色',
            '</palette>',
            '<theme name="主題名稱（中文，十個字以內）">',
            '第二步的 CSS（顏色表不用再寫一次）',
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
        const pm = t.match(/[<＜]\s*palette\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*palette\s*[>＞]/i);
        // 沒寫顏色表但 CSS 裡有 :root 那塊的，也收（舊寫法）
        const pal = _paletteCss(pm ? pm[1] : ((css.match(/:root\s*\{([^}]*)\}/i) || [])[1] || ''));
        return { name: name, css: css, palette: pal.css, missing: pal.missing };
    }
    function generate(want, ref) {
        return new Promise(function (resolve, reject) {
            const O = win.OS_API || window.OS_API;
            if (!O || !O.chatMain) { reject(new Error('模型連線還沒載入')); return; }
            O.chatMain(_aiMessages(want, ref), null,
                function (text) {
                    const r = _parseAi(text);
                    if (!r.css && !r.palette) { reject(new Error('它沒有照格式回')); return; }
                    const finish = function (paletteCss) {
                        const full = (paletteCss ? paletteCss + '\n' : '') + r.css;
                        const c = compile(full);
                        if (!c.ok || !c.kept) { reject(new Error(c.error || '寫出來的樣式一條都用不上')); return; }
                        _askInk(full, _unpaired(full)).then(function (extra) { resolve({ name: r.name, css: full + extra }); });
                    };
                    if (!r.missing.length) { finish(r.palette); return; }
                    // 顏色表缺了核心那幾格：只問顏色，把整張表補齊（不重做造型）
                    const ask = [
                        { role: 'system', content: '你剛才替一支手機聊天 app 設計了一套主題，但顏色表漏了幾格。照你那套主題的風格把整張顏色表補齊。只輸出 <palette> 那一塊，一行一格寫成 格子名: 顏色，不要寫別的字。格子：\n' + PALETTE.map(function (x) { return '・' + x[0] + '：' + x[1]; }).join('\n') },
                        { role: 'user', content: '你那套主題：\n' + String(text).slice(0, 12000) + '\n\n漏掉的格子：' + r.missing.join('、') }
                    ];
                    O.chatMain(ask, null, function (t2) {
                        const pm = String(t2 || '').match(/[<＜]\s*palette\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*palette\s*[>＞]/i);
                        const merged = _paletteCss((r.palette.replace(/^:root\s*\{|\}\s*$/g, '')) + '\n' + (pm ? pm[1] : t2));
                        finish(merged.css);
                    }, function () { finish(r.palette); }, { task: 'wx_theme', label: '聊天 app 主題（補顏色）' });
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
            (_unpaired(t.css).length ? '<button type="button" data-m="ink"><i class="fa-solid fa-icons"></i>補上看不見的符號</button>' : '') +
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
            } else if (what === 'ink') {
                if (_busy) return;
                _busy = true; _renderPage();
                _toast('請它補符號的顏色…');
                const extra = await _askInk(t.css, _unpaired(t.css));
                _busy = false;
                if (!extra) { _renderPage(); _toast('沒補成，再試一次'); return; }
                t.css = String(t.css || '') + extra;
                await _save();
                if (activeId() === id) await apply(id); else _renderPage();
                _toast('補好了');
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

    const API = { compile, load, apply, add, rename, remove, activeId, open, close, generate, exportText, _unpaired };
    win.WX_THEME_PACK = API;
    window.WX_THEME_PACK = API;
    setTimeout(function () { _boot().catch(function (e) { console.warn('[主題] 開機套用失敗', e); }); }, 800);
})();
