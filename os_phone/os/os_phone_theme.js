// os_phone/os/os_phone_theme.js
// 🎨 手機主題工坊 —— 說一句話，AI 做一套手機主題出來。
//
// 一套主題＝「一張格子表」＋「一份骨架選擇」：配色、圖標的樣子、分頁列的樣子，
// 還有東西怎麼擺（一排幾顆、名字要不要、那排常用的擺上面還是浮起來、桌布上加不加裝飾）。
//
// 🚨 骨架這半是 2026-09-20 才開的。在那之前 AI 只能填顏色跟圓角，所以她做幾套出來
//    都只有配色在變、形狀一模一樣（她的說法：「千篇一律改底部導覽形狀+按鈕形狀，挺無聊的」）。
//    真正讓兩套主題像兩支不同的手機的，是東西擺在哪裡、多大、多密 —— 那半以前鎖著。
// 內建那四套的值寫在 css/aurelia_theme.css；她做的那些是資料，存在手機殼那邊
// （VoidPhoneShell.saveUserTheme），開機時拼成一段 <style> 貼進 <head>，格式完全一樣。
//
// 🚨 為什麼只讓 AI 填格子、不讓它寫 CSS：
//    劇情主題那邊 AI 是直接寫 CSS 疊在死的版面上，所以一碰到位置就把畫面弄飛，
//    程式端得架五道關卡去攔（見 os_studio.js 的 _vthStripLayout 那一串）。
//    手機這邊不給它寫 CSS 的機會：它只能回一份「格子名: 值」，不在清單上的一律丟掉，
//    所以它碰不到版面，也就沒有東西需要攔。
//    🚨 開了骨架之後這條仍然成立 —— 骨架不是讓它寫位置，是給它四道選擇題
//       （@dock-place / @nav-place / @icon-layout / @nav-item），每一題只認固定那幾個詞，
//       聯動的那三四格由 _layout() 算。它自己填那幾格一定會漏一格，
//       漏一格的症狀是底排卡在兩列中間、或者被自己的空隙壓矮 10px。
(function () {
    'use strict';
    const win = window;

    // ── 格子表：AI 能填的全部欄位，一格一行說明 ───────────────────────
    //   key 就是 CSS 變數名；hint 是寫給 AI 看的；type 決定怎麼驗。
    //   🚨 加一格＝這裡加一行，其他地方不用動（提示詞與驗證都照這張表生）。
    // ── 版面骨架：AI 說人話，程式翻成格子 ─────────────────────────────
    // 🚨 這幾個不是真的格子（不會被寫進樣式），是「這套主題長什麼骨架」的選擇題。
    //    底排釘在畫面最底下、導覽永遠貼著底，是以前沒開給它的東西 ——
    //    所以她做幾套出來都只有顏色在變，形狀都一樣。
    const LAYOUT = [
        { k: '@dock-place',  v: ['bottom', 'top', 'float'],
          h: '主畫面那排常用的四顆站哪裡。bottom＝畫面最底下（一般手機那樣）／top＝跑到最上面當一條工具列／float＝浮起來蓋在圖標上方，下面要給圓角跟左右留白' },
        { k: '@nav-place',   v: ['bottom', 'top'],
          h: 'app 裡面那條分頁列站哪裡。bottom＝底下（一般那樣）／top＝跑到標題列下面當頂部分頁' },
        { k: '@icon-layout', v: ['stack', 'row', 'iconOnly'],
          h: '主畫面一格裡面怎麼擺。stack＝圖標在上名字在下／row＝圖標在左名字在右（一排放少一點才擺得下）／iconOnly＝只有圖標、不要名字' },
        { k: '@nav-item',    v: ['stack', 'row', 'iconOnly'],
          h: '分頁列每一顆怎麼擺。stack＝圖標在上字在下／row＝圖標在左字在右／iconOnly＝只有圖標' },
    ];
    const LAYOUT_KEYS = LAYOUT.map(function (f) { return f.k; });

    const FIELDS = [
        // ── 版面：大小與疏密（以前只有內建那四套能調，她做的一律吃預設）──
        { k: '--aps-grid-columns',    t: 'int',   min: 2, max: 5, h: '主畫面一排放幾顆。2＝很大很鬆，3＝一般，4～5＝小而密' },
        { k: '--aps-grid-gap',        t: 'len2',  h: '格子之間的空隙，上下與左右兩個值，例如 16px 12px' },
        { k: '--aps-icon-size',       t: 'len',   h: '圖標那塊的寬' },
        { k: '--aps-icon-height',     t: 'len',   h: '圖標那塊的高。跟寬一樣＝正方，比寬矮＝扁的' },
        { k: '--aps-glyph-size',      t: 'len',   h: '圖標裡面那個符號的大小' },
        { k: '--aps-icon-gap',        t: 'len',   h: '圖標跟它名字之間的距離' },
        { k: '--aps-label-size',      t: 'len',   h: '圖標底下那行字多大' },
        { k: '--aps-label-weight',    t: 'int',   min: 100, max: 900, h: '那行字多粗。400＝一般，700＝粗' },
        { k: '--aps-font',            t: 'font',  h: '整支手機的字體，寫字體名就好（可以寫好幾個用逗號隔開）' },

        // ── 配色：手機主畫面 ──
        { k: '--aps-wallpaper',       t: 'bg',    h: '桌布。純色、漸層都行' },
        { k: '--aps-label-color',     t: 'color', h: '圖標底下那行字' },
        { k: '--aps-muted',           t: 'color', h: '主畫面上比較淡的字（日期那種）' },
        { k: '--aps-sb-color',        t: 'color', h: '最上面時間訊號電池那排的字' },
        { k: '--aps-accent',          t: 'color', h: '主畫面的重點色' },
        { k: '--aps-homebar-color',   t: 'color', h: '最底下那根橫槓' },
        { k: '--aps-mood-bg',         t: 'bg',    h: '時鐘旁邊心情那顆的底' },
        { k: '--aps-mood-line',       t: 'color', h: '心情那顆的框線' },
        { k: '--aps-mood-radius',     t: 'len',   h: '心情那顆的圓角（999px＝膠囊）' },
        { k: '--aps-paper',           t: 'bg',    h: '拍立得那張相紙的底' },
        { k: '--aps-paper-line',      t: 'color', h: '相紙的框線' },
        { k: '--aps-paper-shadow',    t: 'shadow',h: '相紙的陰影' },
        { k: '--aps-w-bg',            t: 'bg',    h: '主畫面上組件那一格的底' },
        { k: '--aps-w-line',          t: 'color', h: '組件那一格的框線' },
        { k: '--aps-w-radius',        t: 'len',   h: '組件那一格的圓角' },

        // ── 應用圖標的樣子 ──
        { k: '--aps-icon-radius',     t: 'len',   h: '圖標的圓角。0＝裸圖標沒有底，14px＝圓角方塊，50%＝圓的' },
        { k: '--aps-icon-bg',         t: 'bg',    h: '圖標底下那塊的顏色。transparent＝不要底' },
        { k: '--aps-icon-color',      t: 'color', h: '圖標符號本身的顏色' },
        { k: '--aps-icon-line',       t: 'color', h: '圖標那塊的框線顏色。transparent＝沒有框' },
        { k: '--aps-icon-shadow',     t: 'shadow',h: '圖標那塊的陰影。none＝沒有' },
        { k: '--aps-dock-icon-bg',    t: 'bg',    h: '底排裡那幾顆圖標的底' },
        { k: '--aps-dock-icon-color', t: 'color', h: '底排裡那幾顆圖標的符號顏色' },
        { k: '--aps-dock-icon-radius',t: 'len',   h: '底排裡那幾顆圖標的圓角' },

        // ── 主畫面底排 ──
        { k: '--aps-dock-height',     t: 'len',   h: '主畫面底排的高' },
        { k: '--aps-dock-bg',         t: 'bg',    h: '主畫面底排的底。transparent＝跟桌布融在一起' },
        { k: '--aps-dock-radius',     t: 'len',   h: '主畫面底排的圓角。0＝貼底一條，18px 以上＝一個盒子' },
        { k: '--aps-dock-border',     t: 'bd',    h: '主畫面底排的完整框線，例如 3px solid #fff' },
        { k: '--aps-dock-top',        t: 'bd',    h: '主畫面底排的上緣那條線。貼底那種只有這條有意義' },
        { k: '--aps-dock-shadow',     t: 'shadow',h: '主畫面底排的陰影' },
        { k: '--aps-dock-inset',      t: 'len',   h: '主畫面底排左右各留多少白。貼底一條給 0px，浮起來那種留 10～16px' },
        { k: '--aps-dock-padding',    t: 'len2',  h: '主畫面底排裡面的留白，例如 10px 8px' },

        // ── 換頁那排小點 ──
        { k: '--aps-dot-w',           t: 'len',   h: '每顆點多寬' },
        { k: '--aps-dot-h',           t: 'len',   h: '每顆點多高。跟寬一樣＝圓點，比寬矮很多＝短橫線' },
        { k: '--aps-dot-radius',      t: 'len',   h: '點的圓角。50%＝圓的，0＝方的' },
        { k: '--aps-dot-bg',          t: 'color', h: '點的顏色' },
        { k: '--aps-dot-on-w',        t: 'len',   h: '現在這一頁那顆多寬。給大一點就變成一條長的' },
        { k: '--aps-dot-on-bg',       t: 'color', h: '現在這一頁那顆的顏色' },

        // ── 桌布上的兩塊裝飾（選填，不填就沒有）──
        // 🚨 內建那四套一直都有（雲、虛線框、光暈、小點），她做的以前一塊都放不了。
        //    這兩塊永遠在最底下、不吃點擊，所以怎麼畫都不會擋到東西。
        { k: '--aps-deco1-w',      t: 'len',   o: 1, h: '第一塊裝飾多寬。不要這塊就整組別寫' },
        { k: '--aps-deco1-h',      t: 'len',   o: 1, h: '第一塊裝飾多高' },
        { k: '--aps-deco1-top',    t: 'len',   o: 1, h: '第一塊離畫面上緣多遠。可以是負的，讓它一半跑到畫面外' },
        { k: '--aps-deco1-left',   t: 'len',   o: 1, h: '第一塊離畫面左緣多遠。可以是負的。手機螢幕大約 300px 寬' },
        { k: '--aps-deco1-bg',     t: 'bg',    o: 1, h: '第一塊的顏色。漸層可以做出光暈，transparent＝只有框線' },
        { k: '--aps-deco1-radius', t: 'len',   o: 1, h: '第一塊的圓角。50%＝圓形' },
        { k: '--aps-deco1-border', t: 'bd',    o: 1, h: '第一塊的框線，例如 2px dashed #ddd' },
        { k: '--aps-deco1-rot',    t: 'deg',   o: 1, h: '第一塊轉幾度，例如 -12deg' },
        { k: '--aps-deco2-w',      t: 'len',   o: 1, h: '第二塊裝飾多寬。只要一塊的話這組別寫' },
        { k: '--aps-deco2-h',      t: 'len',   o: 1, h: '第二塊裝飾多高' },
        { k: '--aps-deco2-top',    t: 'len',   o: 1, h: '第二塊離畫面上緣多遠' },
        { k: '--aps-deco2-left',   t: 'len',   o: 1, h: '第二塊離畫面左緣多遠' },
        { k: '--aps-deco2-bg',     t: 'bg',    o: 1, h: '第二塊的顏色' },
        { k: '--aps-deco2-radius', t: 'len',   o: 1, h: '第二塊的圓角' },
        { k: '--aps-deco2-border', t: 'bd',    o: 1, h: '第二塊的框線' },
        { k: '--aps-deco2-rot',    t: 'deg',   o: 1, h: '第二塊轉幾度' },

        // ── 配色：所有面板 ──
        { k: '--os-ink',              t: 'color', h: '面板裡的主字色' },
        { k: '--os-ink-soft',         t: 'color', h: '次要的字（說明、沒選中的分頁）。要用實色，別用半透明' },
        { k: '--os-ink-dim',          t: 'color', h: '更淡的字' },
        { k: '--os-line',             t: 'color', h: '分隔線' },
        { k: '--os-hover',            t: 'color', h: '滑過去／按下去那層淡淡的底' },
        { k: '--os-page-bg',          t: 'bg',    h: '面板整頁的底' },
        { k: '--os-surface',          t: 'bg',    h: '卡片、輸入框那層的底。要比整頁的底再亮或再暗一階' },
        { k: '--os-chrome-bg',        t: 'bg',    h: '面板最上面那條標題列的底' },
        { k: '--os-chrome-tabs-bg',   t: 'bg',    h: '標題列底下那排分頁的底' },
        { k: '--os-accent',           t: 'color', h: '面板的重點色（選中的分頁、主要按鈕）' },
        { k: '--os-accent-strong',    t: 'color', h: '重點色再深一階' },
        { k: '--os-accent-glow',      t: 'color', h: '重點色的光暈，半透明' },
        { k: '--os-on-accent',        t: 'color', h: '壓在重點色上面的字（通常是白或很深）' },

        // ── 底部導覽（app 底下那條分頁列）──
        { k: '--os-nav-bg',           t: 'bg',    h: '底部導覽的底' },
        { k: '--os-nav-border',       t: 'bd',    h: '底部導覽的完整框線。貼底那種給 0 solid transparent' },
        { k: '--os-nav-top',          t: 'bd',    h: '底部導覽的上緣那條線' },
        { k: '--os-nav-height',       t: 'len',   h: '底部導覽的高' },
        { k: '--os-nav-radius',       t: 'len',   h: '底部導覽的圓角。0＝貼底一條，18px 以上＝浮起來的一塊' },
        { k: '--os-nav-inset',        t: 'len',   h: '底部導覽左右各留多少白。貼底那種給 0' },
        { k: '--os-nav-gap-bottom',   t: 'len',   h: '底部導覽離畫面底多遠。貼底那種給 0px' },
        { k: '--os-nav-shadow',       t: 'shadow',h: '底部導覽的陰影' },
        { k: '--os-nav-ink',          t: 'color', h: '沒選中那幾顆的顏色' },
        { k: '--os-nav-ink-on',       t: 'color', h: '選中那一顆的顏色' },
        { k: '--os-nav-on-bg',        t: 'bg',    h: '選中那一顆的圖標後面墊的那塊底。transparent＝只變色不墊底' },
        { k: '--os-nav-on-radius',    t: 'len',   h: '墊的那塊底的圓角。999px＝藥丸' },
    ];
    const FIELD_KEYS = FIELDS.map(function (f) { return f.k; });
    const FIELD_BY_K = {}; FIELDS.forEach(function (f) { FIELD_BY_K[f.k] = f; });
    // 必填＝沒標選填的那些。選填那幾格（桌布上的裝飾）不填就是沒有，不算漏。
    const NEED_KEYS = FIELDS.filter(function (f) { return !f.o; }).map(function (f) { return f.k; });

    // 值長得對不對：型別不合就丟掉那一格（丟掉＝沿用預設，整套仍然能用）
    function _okType(f, v) {
        switch (f.t) {
            case 'int': {
                if (!/^-?\d+$/.test(v)) return false;
                const n = +v;
                return !(f.min != null && n < f.min) && !(f.max != null && n > f.max);
            }
            case 'deg':  return /^-?\d+(\.\d+)?deg$/.test(v);
            case 'len':  return /^-?\d+(\.\d+)?(px|%|em|rem)$/.test(v) || v === '0' || v === 'auto';
            // 一到四個長度，用空白隔開；裸 0 是合法的（padding: 10px 0 0 這種很常見）
            case 'len2': {
                const one = '(-?\\d+(\\.\\d+)?(px|%|em|rem)|0)';
                return new RegExp('^' + one + '(\\s+' + one + '){0,3}$').test(v);
            }
            // 字體只准字體名：中英數、空白、逗號、引號、連字號。擋掉一切函式與符號
            case 'font': return /^[-\w一-鿿"',\s]+$/.test(v) && v.length <= 80;
            default:     return true;
        }
    }

    // 這兩格是「同一個顏色的兩種寫法」，面板裡大量半透明的線與淡底吃的是數字版。
    // 不叫 AI 填，改用它給的顏色自己算 —— 它算錯的話症狀是「字換了、線還是舊顏色」。
    const RGB_PAIRS = [['--os-ink', '--os-ink-rgb'], ['--os-page-bg', '--os-tint-rgb']];

    // ── 提示詞：整份照 FIELDS 生，改格子表這裡自動跟上 ──────────────
    function _prompt() {
        const need = FIELDS.filter(function (f) { return !f.o; }).map(function (f) { return '- ' + f.k + '：' + f.h; }).join('\n');
        const opt  = FIELDS.filter(function (f) { return f.o; }).map(function (f) { return '- ' + f.k + '：' + f.h; }).join('\n');
        const sk   = LAYOUT.map(function (f) { return '- ' + f.k + '：' + f.v.join(' / ') + '。' + f.h; }).join('\n');
        return [
            '你是手機介面的視覺設計師。使用者給你一句話（一個氛圍、一個顏色、一個東西），你要把它變成一套完整的手機主題。',
            '手機本身那個外殼（金屬邊框、側邊按鍵）不歸你管，那是這支手機，不是介面。',
            '',
            '## 先決定骨架，再決定顏色',
            '同樣一支手機，換了顏色仍然是同一支手機。真正讓兩套主題看起來是兩支不同的手機的，是東西擺在哪裡、多大、多密。',
            '所以你要先挑下面這幾個，而且要挑得跟這次的氛圍有關係——不要每次都挑一樣的：',
            sk,
            '',
            '挑的時候想一下這幾件事互相配不配：',
            '- 一排只放 2 顆的時候圖標要大（70px 以上）；放 4～5 顆的時候圖標要小（40px 上下），名字也要跟著縮。',
            '- 圖標在左名字在右（row）那種，一排最多放 2 顆，不然名字沒地方擺。',
            '- 只有圖標不要名字（iconOnly）那種，圖標自己要夠有辨識度：給它底色或框線，不要裸著。',
            '- 那排四顆浮起來（float）的時候，左右留白給 10～16px、圓角給大值、陰影要有，它才像浮著。貼底那種就全部給 0。',
            '',
            '## 再填格子',
            need,
            '',
            '## 桌布上的裝飾（選填）',
            '兩塊可以自由擺的形狀，畫在桌布上、永遠在所有東西的最底下。一塊大圓加半透明漸層＝光暈；',
            '一塊跟整個畫面差不多大、只有虛線框、顏色 transparent＝一圈框；細長一條加旋轉＝一道斜線或一段膠帶。',
            '不需要就整組都別寫（兩塊各自獨立，可以只要一塊）。',
            opt,
            '',
            '## 顏色',
            '1. 整套要像同一個東西做出來的。面板整頁的底跟卡片那層要分得出來，深色主題的字要夠亮、淺色主題的字要夠深。',
            '2. 應用圖標：裸符號沒有底、圓角方塊、圓形、有框線、有陰影——選一種，然後底排那幾顆跟著同一個做法。',
            '3. app 裡那條分頁列：要嘛貼底一條（圓角 0、左右留白 0、離底 0px、只有上緣一條線），要嘛浮起來一塊（圓角給大值、左右留白與離底各留幾 px、給完整框線與陰影）。兩種不要混。選中那一顆可以只變色（墊底那格給 transparent），也可以在它的圖標後面墊一塊底——墊的那塊只在圖標後面、不會蓋住下面的字。',
            '',
            '## 規矩',
            '- 顏色用 #rrggbb 或 rgba()；長度帶單位（px、%）；不要用 var()、不要用 calc()、不要引用其他格子。',
            '- 不要寫任何 CSS 規則或選擇器，只填格子的值。',
            '- 不要用圖片網址當桌布（她自己會換照片）；桌布用純色或漸層。',
            '- 帶意思的顏色不歸主題管（刪除紅、警告紅、接通綠、連結藍），不要想辦法把它們塞進來。',
            '- 「再填格子」那一段每一格都要有值。少一格，那一格會掉回預設那套，整套就會看起來只換一半。',
            '',
            '## 輸出',
            '只輸出一段 JSON，前後不要有任何其他字：',
            '{"name":"四個字以內的中文名字","layout":{"@dock-place":"…","@nav-place":"…","@icon-layout":"…","@nav-item":"…"},'
              + '"swatch":["#桌布色","#底排色","#重點色"],"vars":{"--格子名":"值", …}}',
        ].join('\n');
    }

    // ── 驗：只留清單上的格子，其餘一律丟掉 ─────────────────────────
    function _clean(raw) {
        const out = {};
        const vars = (raw && raw.vars) || {};
        Object.keys(vars).forEach(function (k) {
            if (FIELD_KEYS.indexOf(k) < 0) return;                       // 不在表上＝丟掉（它碰不到版面）
            let v = String(vars[k] == null ? '' : vars[k]).trim();
            if (!v) return;
            if (/[{}<>;]|@import|url\s*\(|expression\s*\(/i.test(v)) return;   // 值裡不准夾規則、不准連外
            if (/var\s*\(/.test(v)) return;                              // 引用別的格子＝她刪掉那套時會整串垮掉
            if (!_okType(FIELD_BY_K[k], v)) return;                      // 型別不合＝那一格沿用預設，其餘照樣成立
            out[k] = v;
        });
        _layout(raw, out);   // 版面骨架：它說的人話在這裡翻成真的格子
        // 數字版的顏色自己算，不信 AI 給的
        RGB_PAIRS.forEach(function (pair) {
            const rgb = _toRgb(out[pair[0]]);
            if (rgb) out[pair[1]] = rgb.join(', ');
        });
        // 選中那一顆的圖標後面若真的墊了一塊底，圖標的顏色要跟「那塊底」比，不是跟導覽列的底比。
        // 這一格不叫 AI 填：它常常挑一個跟墊底同色系的，結果圖標整個埋進去看不見。
        // 底是深的就給白字、淺的就給黑字，永遠讀得到。沒墊底（transparent）就沿用選中的顏色。
        const ink = _onInk(out['--os-nav-on-bg']);
        if (ink) out['--os-nav-on-ink'] = ink;
        return out;
    }
    // ── 版面骨架：把「上面／下面／浮著」翻成那幾格 ──────────────────
    //    AI 只挑一個詞，聯動的三四格由這裡算。它自己填那幾格一定會漏一格，
    //    漏一格的症狀是底排卡在兩列中間、或格子區高度算錯。
    function _layout(raw, out) {
        const L = (raw && (raw.layout || raw.skeleton)) || {};
        const pick = function (k, def) {
            const f = LAYOUT[LAYOUT_KEYS.indexOf(k)];
            const v = String(L[k] == null ? (L[k.slice(1)] == null ? '' : L[k.slice(1)]) : L[k]).trim();
            return f.v.indexOf(v) >= 0 ? v : def;
        };

        // 主畫面那排四顆
        const dock = pick('@dock-place', 'bottom');
        if (dock === 'top') {
            // 站到最上面那一列：上面那列給它高度、下面那列收成 0。
            // 列與列之間那 10px 也要跟著搬：它下面留 10px，換頁那排點下面就不用再留。
            out['--aps-dock-row'] = '1';
            out['--aps-row-top']  = 'var(--aps-dock-height)';
            out['--aps-row-bot']  = '0px';
            out['--aps-dock-mb']  = '10px';
            out['--aps-dots-mb']  = '0px';
        } else if (dock === 'float') {
            // 浮起來蓋在格子上：離開版面流（下面那列收 0），左右與離底用它自己填的留白，
            // 格子區最後補一段留白，不然最下面那一排被蓋住點不到
            const inset = out['--aps-dock-inset'] || '12px';
            out['--aps-dock-pos'] = 'absolute';
            out['--aps-dock-l']   = inset;
            out['--aps-dock-r']   = inset;
            out['--aps-dock-b']   = '10px';
            out['--aps-dock-inset'] = '0px';       // 已經用 left/right 擺好了，margin 不能再推一次
            out['--aps-row-bot']  = '0px';
            out['--aps-dots-mb']  = '0px';
            out['--aps-grid-pad-bot'] = 'calc(var(--aps-dock-height) + 18px)';
        }

        // app 裡那條分頁列
        if (pick('@nav-place', 'bottom') === 'top') out['--os-nav-order'] = '-1';

        // 主畫面一格裡面怎麼擺
        const icon = pick('@icon-layout', 'stack');
        if (icon === 'row') {
            out['--aps-icon-dir']   = 'row';
            out['--aps-icon-align'] = 'center';
            out['--aps-label-align'] = 'left';
            out['--aps-label-flex'] = '1 1 auto';
        } else if (icon === 'iconOnly') {
            out['--aps-label-display'] = 'none';
        }

        // 分頁列每一顆怎麼擺
        const navItem = pick('@nav-item', 'stack');
        if (navItem === 'row') out['--os-nav-item-dir'] = 'row';
        else if (navItem === 'iconOnly') out['--os-nav-label-display'] = 'none';
    }

    function _toRgb(v) {
        if (!v) return null;
        let m = /^#([0-9a-f]{3})$/i.exec(v);
        if (m) return m[1].split('').map(function (c) { return parseInt(c + c, 16); });
        m = /^#([0-9a-f]{6})$/i.exec(v);
        if (m) return [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16); });
        m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(v);
        if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
        return null;
    }
    // 墊底那塊上面該用什麼字色：深底給白、淺底給黑。沒墊底（透明或半透明）回 null＝沿用選中色。
    function _onInk(v) {
        const rgb = _toRgb(v);
        if (!rgb) return null;
        if (/transparent/i.test(String(v)) || /rgba\([^)]*,\s*0?\.[0-3]\d*\s*\)/i.test(String(v))) return null;
        return _lum(rgb) < 0.45 ? '#ffffff' : '#16181a';
    }
    function _lum(rgb) {
        const lin = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    }
    // 桌布上那兩塊裝飾是選填的，沒填不算漏 —— 不然每套都會報「漏了 16 格」
    function _missing(vars) { return NEED_KEYS.filter(function (k) { return !vars[k]; }); }

    // AI 常常在 JSON 前後多寫兩句，或包在圍欄裡 —— 撈出最外層那一對大括號就好
    function _pickJson(text) {
        const s = String(text == null ? '' : text);
        const i = s.indexOf('{'), j = s.lastIndexOf('}');
        if (i < 0 || j <= i) return null;
        try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
    }

    const _esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    let _pending = null;   // 這次做出來還沒存的那套

    // ── 預覽：用她剛做出來那套值畫一支小手機 ＋ 一條底部導覽 ──────────
    //   直接把格子寫在預覽容器的行內樣式上，所以看到的就是真的那組值，不是我另外畫一份。
    function _paintPreview(box, vars) {
        if (!box) return;
        box.removeAttribute('style');
        Object.keys(vars).forEach(function (k) { box.style.setProperty(k, vars[k]); });
        box.classList.toggle('pth-empty', !Object.keys(vars).length);
    }

    // 預覽那六格：用真的 app 名字（兩個字跟三個字都有），才看得出名字放不放得下
    const PV_CELLS = [
        ['fa-comment', '聊天'], ['fa-calendar-days', '日曆'], ['fa-book-open', '藏書'],
        ['fa-gear', '設置'], ['fa-images', '相簿'], ['fa-phone', '電話'],
    ];
    function _pvCells() {
        return PV_CELLS.map(function (c) {
            return '<span class="pth-cell"><span class="pth-ic"><i class="fa-solid ' + c[0] + '"></i></span>'
                 + '<em class="pth-nm">' + c[1] + '</em></span>';
        }).join('');
    }

    function launch(container) {
        if (!container) return;
        container.innerHTML =
            '<div class="pth-app">'
          +   '<div class="pth-head sysh">'
          +     '<button class="pth-back sysh-back" type="button" title="返回">‹</button>'
          +     '<span class="sysh-title">手機主題</span>'
          +   '</div>'
          +   '<div class="pth-body">'
          +     '<div class="pth-say">說一句話，做一套手機主題。配色、圖標的樣子、分頁列的樣子，還有東西怎麼擺——一排放幾顆、名字要不要、那排常用的擺上面還是浮起來、桌布上加不加一塊裝飾，都會跟著這句話變。</div>'
          +     '<textarea class="pth-input" rows="2" placeholder="例如：深海玻璃、暖橘手帳、黑白塗鴉、舊書房"></textarea>'
          +     '<div class="pth-row">'
          +       '<button class="pth-btn pth-go" type="button">做一套</button>'
          +       '<span class="pth-status"></span>'
          +     '</div>'
          +     '<div class="pth-preview">'
          +       '<div class="pth-phone">'
          +         '<div class="pth-sb"><span>9:41</span><span><i class="fa-solid fa-signal"></i> <i class="fa-solid fa-wifi"></i> <i class="fa-solid fa-battery-full"></i></span></div>'
          // 一格連名字一起畫，不然「圖標在左名字在右」「只有圖標」那兩種在預覽上看不出差別
          +         '<div class="pth-grid">' + _pvCells() + '</div>'
          +         '<div class="pth-w">組件</div>'
          +         '<div class="pth-dock">'
          +           '<span class="pth-ic"><i class="fa-solid fa-comment"></i></span>'
          +           '<span class="pth-ic"><i class="fa-solid fa-eye"></i></span>'
          +           '<span class="pth-ic"><i class="fa-solid fa-bag-shopping"></i></span>'
          +         '</div>'
          +       '</div>'
          +       '<div class="pth-panel">'
          +         '<div class="pth-panel-hd">一個面板</div>'
          +         '<div class="pth-panel-tabs"><span class="on">分頁</span><span>分頁</span></div>'
          +         '<div class="pth-panel-body"><div class="pth-card">卡片上的字</div><div class="pth-dim">比較淡的說明字</div></div>'
          +         '<div class="pth-nav"><span class="on"><i class="fa-solid fa-house"></i><em>首頁</em></span><span><i class="fa-solid fa-user"></i><em>我</em></span></div>'
          +       '</div>'
          +     '</div>'
          +     '<div class="pth-save">'
          +       '<input class="pth-name" type="text" placeholder="給它一個名字">'
          +       '<button class="pth-btn pth-keep" type="button">存起來並套用</button>'
          +     '</div>'
          +     '<div class="pth-note">存起來之後，它會出現在手機設置的主題那一排，跟內建那四套並排。不想要了在那排上點它右上角的叉。</div>'
          +   '</div>'
          + '</div>';

        const $ = function (s) { return container.querySelector(s); };
        const box = $('.pth-preview'), status = $('.pth-status');
        const back = $('.pth-back');
        if (back) back.addEventListener('click', function () {
            if (win.PhoneSystem && win.PhoneSystem.goHome) win.PhoneSystem.goHome();
            else if (win.VoidPhoneShell && win.VoidPhoneShell.home) win.VoidPhoneShell.home();
        });

        const say = function (t, bad) { if (status) { status.textContent = t || ''; status.classList.toggle('bad', !!bad); } };

        $('.pth-go').addEventListener('click', async function () {
            const want = ($('.pth-input').value || '').trim();
            if (!want) { say('先說一句話，隨便什麼氛圍都行', true); return; }
            const btn = this;
            btn.disabled = true; say('做做看…');
            try {
                const text = await _ask(want);
                const raw = _pickJson(text);
                if (!raw) { say('它回的東西看不懂，再按一次', true); btn.disabled = false; return; }
                const vars = _clean(raw);
                const miss = _missing(vars);
                _pending = {
                    id: 'u' + Date.now().toString(36),
                    name: String(raw.name || want).slice(0, 8),
                    swatch: _swatch(raw.swatch, vars),
                    vars: vars,
                };
                _paintPreview(box, vars);
                const n = $('.pth-name'); if (n && !n.value.trim()) n.value = _pending.name;
                say(miss.length ? ('做好了，有 ' + miss.length + ' 格它沒填，那幾格會沿用預設那套') : '做好了，看看喜不喜歡');
            } catch (e) {
                console.warn('[手機主題] 生成失敗', e);
                say('沒做出來：' + ((e && e.message) || e), true);
            }
            btn.disabled = false;
        });

        $('.pth-keep').addEventListener('click', function () {
            if (!_pending) { say('先做一套出來', true); return; }
            const V = win.VoidPhoneShell;
            if (!V || !V.saveUserTheme) { say('手機殼還沒載入', true); return; }
            const nm = ($('.pth-name').value || '').trim();
            if (nm) _pending.name = nm.slice(0, 8);
            V.saveUserTheme(_pending);
            if (V.useTheme) V.useTheme(_pending.id);
            say('存好了，已經換上這套');
        });
    }

    // 那顆預覽小圓：她給三個顏色就用她的，沒給就從桌布／底排／重點色湊
    function _swatch(arr, vars) {
        const a = Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
        const c1 = a[0] || vars['--aps-wallpaper'] || '#ddd';
        const c2 = a[1] || vars['--aps-dock-bg'] || vars['--os-surface'] || '#bbb';
        const c3 = a[2] || vars['--aps-accent'] || vars['--os-accent'] || '#888';
        const plain = function (v) { return /^#|^rgb/i.test(String(v).trim()) ? v : '#cccccc'; };
        return 'linear-gradient(135deg, ' + plain(c1) + ' 0 38%, ' + plain(c2) + ' 38% 72%, ' + plain(c3) + ' 72% 100%)';
    }

    // 地基留給主模型：副模型做不了設計，這跟劇情主題那邊是同一個結論。
    async function _ask(want) {
        const API = win.OS_API;
        if (!API || !API.chatMain) throw new Error('API 還沒載入');
        const messages = [
            { role: 'system', content: _prompt() },
            { role: 'user', content: '這次要的是：' + want },
        ];
        return await new Promise(function (resolve, reject) {
            API.chatMain(messages, null,
                function (full) { resolve(full); },
                function (err) { reject(err instanceof Error ? err : new Error(String(err || '沒有回應'))); },
                { task: 'phone_theme', label: '手機主題', stream: false });
        });
    }

    // clean／prompt 外露是為了驗得到：拿一份假回覆丟進 clean，就能看到程式實際算出哪些格子
    win.OS_PHONE_THEME = { launch: launch, FIELDS: FIELDS, LAYOUT: LAYOUT, onInk: _onInk, clean: _clean, prompt: _prompt };
    console.log('✅ OS_PHONE_THEME（手機主題工坊）模組就緒');
})();
