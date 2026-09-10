// ----------------------------------------------------------------
// [檔案] wx_bubble_ai.js — 泡泡主題：跟 AI 說一句，他出一整套
// 路徑：os_phone/wx/wx_bubble_ai.js
// 職責：氣泡設置第三個分頁「AI 主題」的腦。出 prompt、叫主模型、
//       把回覆裡的 CSS 挑出來、擋掉會把版位打壞的寫法。
//       UI 在 wx_bubble_settings.js，儲存也在那邊（跟微調同一份 config）。
//
// 🚨 兩個 app 共用一套選擇器：微信的 .wx-msg-row.me 跟 VN 手機的 .chat-row.you
//    講的是同一件事（我方），名字卻是反的。所以主題一律只認 .pbub-* 這組
//    共用 class，兩邊的訊息列在渲染時都會帶上；AI 完全不必知道有兩個 app。
//    共用 class 掛在：wx_view.js（微信）、vn_phone.js（VN 手機）。
// 暴露：window.WX_BUBBLE_AI
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WeChat] 載入泡泡主題 AI (wx_bubble_ai.js)...');
    const win = window.parent || window;

    // ── 底稿：AI 的 CSS 會接在這後面 ──────────────────────────────
    // 為什麼要有這一段：兩個 app 的尖角畫在不同的偽元素上（微信我方是
    // ::before、VN 手機我方是 ::after），AI 沒辦法一份 CSS 顧到兩種。
    // 底稿把原生尖角收掉，改成「一律由 .pbub-bubble::before 畫」，
    // 並且讓它吃跟泡泡同一顆變數 → AI 只要設 --pbub-me-bg，尖角自己跟上。
    // 🚨🚨特異性：兩個 app 的預設泡泡都是三個 class 寫成的
    //   （.wx-msg-row.me .wx-bubble-content、.chat-row.you .chat-bubble ＝ 0,3,0）。
    //   底稿寫成 .pbub-me .pbub-bubble 只有 0,2,0，會整條輸給預設——
    //   實測就是「主題套了、字色變了、泡泡底色卻紋風不動」。
    //   所以底稿一律寫成 .pbub-row.pbub-me .pbub-bubble（0,3,0，跟預設同分、注入在後面所以贏），
    //   AI 那份再由 boost() 提到 0,4,0 以上蓋過底稿。
    const BASE_CSS = `
/* 泡泡主題底稿（程式產生，AI 的 CSS 接在後面覆蓋） */
.pbub-row.pbub-row .pbub-bubble::after { content: none !important; }
.pbub-row.pbub-row .pbub-bubble { position: relative; }
.pbub-row.pbub-other .pbub-bubble { background: var(--pbub-other-bg, #ffffff); color: var(--pbub-other-fg, #000000); border-radius: var(--pbub-other-radius, 6px); }
.pbub-row.pbub-me .pbub-bubble { background: var(--pbub-me-bg, #95ec69); color: var(--pbub-me-fg, #000000); border-radius: var(--pbub-me-radius, 6px); }
.pbub-row.pbub-row .pbub-bubble::before { content: ''; position: absolute; top: var(--pbub-tail-top, 14px); width: 0; height: 0; border-top: var(--pbub-tail-size, 6px) solid transparent; border-bottom: var(--pbub-tail-size, 6px) solid transparent; pointer-events: none; }
.pbub-row.pbub-other .pbub-bubble::before { left: calc(var(--pbub-tail-size, 6px) * -1); border-right: var(--pbub-tail-size, 6px) solid var(--pbub-other-bg, #ffffff); border-left: 0; }
.pbub-row.pbub-me .pbub-bubble::before { right: calc(var(--pbub-tail-size, 6px) * -1); border-left: var(--pbub-tail-size, 6px) solid var(--pbub-me-bg, #95ec69); border-right: 0; }
`;

    // ── 一次性生成的 prompt ────────────────────────────────────────
    const PROMPT = `你是手機聊天介面的 UI 設計師。根據使用者描述的風格，生成一段純 CSS，重新設計聊天泡泡（只有泡泡，其他一律別碰）。

【你在設計什麼 — 先看懂這個畫面】
一支手機，直的，畫面寬約 390px。使用者正在跟某個人傳訊息。
訊息一列一列由上往下排，新的在最下面：對方講的話靠左、自己講的話靠右。
每一列最外側貼著一張 40px 的方形頭像，頭像旁邊就是泡泡，泡泡最寬佔畫面的七成。
泡泡尖端有一個小三角形指著自己那側的頭像。
群聊時，對方的泡泡上面會多一行小字寫他是誰。
泡泡底下鋪的是使用者自己挑的聊天背景圖，什麼都可能——素色、風景、深色夜景、亮到發白的圖。
使用者會在這個畫面裡一句一句讀完整段對話，讀幾百輪。
你要做的是讓這些泡泡看起來像「那個世界裡的通訊軟體」，材質、年代、氣氛都看得出來，而不是在微信上換個顏色。

【畫面的結構 — 縮排＝父子關係】
  .pbub-row ................. 一整列訊息（頭像＋泡泡），橫向排列
      身上一定帶 .pbub-me（自己講的，靠右）或 .pbub-other（對方講的，靠左）其中一個
    .pbub-avatar ............ 那張 40px 方形頭像，貼在列的最外側
    .pbub-bubble ............ 泡泡本體，話就寫在裡面
      ::before .............. 尖角三角形（底稿已經畫好，見下面「尖角」）

【你的 CSS 會被怎麼使用 — 現況與限制】
- 你寫的 CSS 會「接在一份底稿後面」，不是取代它。底稿定義了尖角，還有這幾顆變數：
    --pbub-me-bg / --pbub-me-fg / --pbub-me-radius ........ 自己那側的底色 / 字色 / 圓角
    --pbub-other-bg / --pbub-other-fg / --pbub-other-radius  對方那側的底色 / 字色 / 圓角
    --pbub-tail-size ...... 尖角大小（預設 6px；設 0 等於不要尖角）
    --pbub-tail-top ....... 尖角離泡泡頂端多遠（預設 14px）
  在 :root 設這幾顆，泡泡跟尖角會一起跟著變，這是最省事的做法。
- 尖角：底稿用 .pbub-bubble::before 畫了一個三角形，顏色吃 --pbub-me-bg / --pbub-other-bg。
  你設變數它自己跟上；想做別的形狀（方尾、圓尾、鋸齒、沒有尾巴）就直接覆蓋 .pbub-me .pbub-bubble::before
  跟 .pbub-other .pbub-bubble::before 這兩條，或把 --pbub-tail-size 設成 0 讓它消失。
  ⚠️泡泡底色如果用漸層或圖片，尖角吃不到——那就別留尖角（--pbub-tail-size:0），或者自己把
  ::before 改成用 background 畫的小方塊旋轉 45 度。底色是漸層、尖角是純色，接縫會很明顯。
- 沒有外部圖片可用：圖案只能用漸層、內聯 SVG 的 data URI，或 CSS 畫。字體用 @import 從 Google Fonts 載。
- 同一份 CSS 兩個地方都會用到（手機 app 裡的聊天、故事劇情裡演出來的手機畫面），所以只准寫 .pbub-* 這組選擇器。

【這是拿來讀字的 — 先懂用途，再談造型】
泡泡存在的唯一理由，是讓人把裡面那句話讀完。它疊在一張使用者自選、明暗未知的背景圖上。
- 泡泡的底必須夠不透明：實心色，或 alpha ≥ 0.85。要玻璃感就把透明留給邊緣，字的正下方壓一層實底。
- 字色跟底色要強對比：深底亮字、亮底深字。不要半透明的字，不要相近色。
- 裝飾不准壓在字上：花紋、線條、光暈、圖案一律走泡泡的邊緣、角落，或泡泡外面。中間留給字。
- 所有裝飾一律 pointer-events:none（泡泡可以長按叫出選單，裝飾蓋住會擋掉）。

【可設計的元素 — 只有這三個】
- .pbub-bubble：泡泡本體，你的主力。底色、字色、字體、字級、行距、內距、圓角、邊框、陰影、
  ::before 尖角、材質紋理、動畫都放手做。自己那側（.pbub-me .pbub-bubble）跟對方那側
  （.pbub-other .pbub-bubble）「兩側都要設計」，而且要看得出是同一套東西的兩個角色。
- .pbub-avatar：頭像框。外框造型、圓角、邊框、陰影、濾鏡可以改，配合泡泡的風格。
  ⚠️尺寸維持 40px 上下，變太大會把泡泡擠掉。頭像圖本身是使用者設的，你只做框。
- .pbub-row：整列。只准改 margin（上下間距）跟 gap（頭像與泡泡的距離）。見下面的版位契約。

【版位是契約 — 這幾個屬性一個字都不准寫】
.pbub-row 身上「絕對不可以出現」：display / flex-direction / justify-content / position / float。
.pbub-me 與 .pbub-other 是掛在同一個列元素上的，所以「單獨寫 .pbub-me { } 或 .pbub-other { }」
等於在寫列，同一份禁令照算。要改泡泡就寫 .pbub-me .pbub-bubble（中間有空格），別漏掉後面那半。
左右分邊是靠 flex-direction 做的（自己那側是 row-reverse），你寫了就會把兩邊的訊息全部推到同一側。
.pbub-bubble 上不准寫 position:absolute / fixed、不准寫 float，也不准用 margin-left/right 的負值
把泡泡拖出畫面。max-width 不要超過 78%，泡泡貼到邊會很難讀。

【骨架 — 這一區是關係，每一條都要能在你寫的 CSS 裡驗出來】
- 兩側的差別不可以只有顏色：圓角的形狀、邊框的有無或厚度、陰影的方向，至少有一項明顯不同。
- 泡泡的四個角不可以都是同一個圓角值。哪一角尖、哪一角圓，是這套設計的簽名。
- 泡泡跟頭像框之間要有一處呼應：同一種圓角語言、同一組邊框厚度、或同一個切角。
- 這一區不給例外。長相隨你，形狀關係照這裡走。

【完成度】
兩側泡泡、頭像框用同一套設計語言做成完整一組。不可以自己那側做得很講究、對方那側還停在預設白。

【輸出格式】
1. 先輸出一段 <版面骨架>…</版面骨架>，60~100 字：這次的泡泡是那個世界裡的什麼東西（紙條、終端訊窗、
   刻痕、符紙、票根…），兩側各是什麼角色，尖角留不留、為什麼，頭像框是什麼材質的框。
   講不出「它是什麼」，畫出來就會是兩個圓角矩形換顏色。寫下來才會照著做。
2. 接著才是 CSS，用 \`\`\`css 包起來。骨架那段之外不要別的解釋文字。
3. 輸出前自檢一次：兩側都設計了嗎？四個角還是同一個圓角嗎？字底下那層夠不透明嗎？
   .pbub-row 上有沒有不小心寫到 display / flex-direction / justify-content？
   底色改成漸層了但尖角還是純色嗎（會有接縫，要嘛去掉尖角、要嘛自己重畫）？有問題就修好再輸出。

使用者想要的風格：`;

    // 💬 對話式：規則沿用上面那份，只換掉「一次性生成」這個前提
    const CHAT_PROMPT = PROMPT.replace('使用者想要的風格：', '') + `
【這是一段對話，不是一次性生成】
- 每次回覆都要輸出「完整的最新 CSS」（不是片段、不是 diff），用 \`\`\`css 包起來；使用者會直接拿去套用。
- 只改使用者這次講的地方，沒被提到的部分原封不動保留，不要順手重做。
- CSS 之外可以用一兩句話說你改了什麼，不要長篇解釋。
- 使用者問的是問題、或你需要先確認才知道怎麼改，就只回話、不要輸出 CSS。
- 微調時不必再寫 <版面骨架>——除非要改的就是版面結構本身（兩側的分法、尖角的去留、圓角的簽名），那就重寫一次再改。
`;

    // ── 從 AI 回覆裡挑出 CSS ───────────────────────────────────────
    // 🚨照創作室主題那支的教訓做：只認「成對的 ```」會漏掉兩種常見情況——
    //   ① 回覆被輸出上限截斷，只有開頭那個 ``` ② 模型直接吐純 CSS，一個 ``` 都沒有。
    //   漏掉的下場是整包 CSS 被當成說明文字原封不動貼進對話泡泡。
    function pickCss(raw) {
        const s0 = String(raw || '');
        const looksCss = (t) => /\{[\s\S]*?\}/.test(t) && (t.match(/\}/g) || []).length >= 2;
        const clean = (t) => String(t || '').replace(/<\/?版面骨架>/g, '').trim();
        let m = s0.match(/```(?:css)?\s*([\s\S]*?)```/i);
        if (m) return { css: m[1].trim(), note: clean(s0.replace(/```[\s\S]*?```/g, '')), cut: false };
        m = s0.match(/```(?:css)?\s*([\s\S]*)$/i);
        if (m && looksCss(m[1])) return { css: m[1].trim(), note: clean(s0.slice(0, m.index)), cut: true };
        // 沒有圍欄時：骨架宣告那段要先撕下來當說明，它在 CSS 裡是無效選擇器，
        // 混進去會把緊接著的第一條規則一起吃掉
        const bm = s0.match(/<版面骨架>([\s\S]*?)<\/版面骨架>/);
        const body = bm ? s0.replace(bm[0], '').trim() : s0;
        if (looksCss(body)) return { css: body, note: bm ? clean(bm[1]) : '', cut: false };
        return { css: '', note: clean(s0), cut: false };
    }

    // ── 提權：讓 AI 那份蓋得過兩個 app 的預設 ──────────────────────
    // 🚨🚨兩個 app 的預設泡泡都是三個 class 寫成的（0,3,0）。AI 照 prompt 寫的
    //   .pbub-me .pbub-bubble 只有 0,2,0，整條會輸給預設——實測就是「字色變了、底色沒變」。
    //   這裡把每條選擇器的第一個 .pbub-* 重複三次，特異性 +2。重複同一個 class
    //   不改變它匹配誰，只加分；比整份灌 !important 溫和得多——AI 自己那份裡的
    //   先後與強弱關係原封不動，她之後想在 CSS 分頁手動蓋掉某一條也還蓋得動。
    //   存起來的一律是 AI 的原文，提權只在注入前做一次。
    function boost(css) {
        return String(css || '').replace(/(^|[{};])\s*([^{}@;]+)\{/g, (whole, pre, sel) => {
            if (!/\.pbub-/.test(sel)) return whole;
            const out = sel.split(',').map(part => {
                const m = part.match(/\.pbub-[\w-]+/);
                return m ? part.replace(m[0], m[0] + m[0] + m[0]) : part;
            }).join(',');
            return pre + out + '{';
        });
    }

    // ── 版位契約：碰到就地剝掉 ─────────────────────────────────────
    // 左右分邊是 flex-direction 做的。主題只要在 .pbub-row 上寫了 display 或
    // flex-direction，兩邊的訊息就會全部擠到同一側——留著畫面一定壞，講不聽就剝。
    const LOCK_PROPS = /(^|;)\s*(display|flex-direction|justify-content|position|float)\s*:[^;}]*/gi;
    function stripLayout(css) {
        let hit = 0;
        const out = String(css || '').replace(/([^{}]+)\{([^}]*)\}/g, (whole, sel, body) => {
            const sl = sel.trim();
            if (/:hover|:active|:focus/.test(sl)) return whole;
            // 只鎖「列」本身；泡泡與頭像身上的 position/display 是正當用法。
            // 🚨.pbub-me / .pbub-other 跟 .pbub-row 掛在同一個元素上（列身上一定帶其中一個），
            //   所以 .pbub-me{display:block} 一樣會把左右分邊弄壞——三個都要鎖，只鎖 .pbub-row 有漏。
            if (!/\.pbub-(?:row|me|other)/.test(sl) || /\.pbub-bubble|\.pbub-avatar|::/.test(sl)) return whole;
            const nb = body.replace(LOCK_PROPS, (m, p1) => { hit++; return p1 || ''; });
            return sel + '{' + nb + '}';
        });
        return { css: hit ? out : String(css || ''), hit };
    }

    // ── 掃出「看起來會壞」的寫法，套用時直接講給她聽 ──────────────
    function risky(css) {
        const t = String(css || '');
        const out = [];
        // 泡泡沒有底：字直接壓在使用者的聊天背景圖上
        const clearBg = /\.pbub-(?:me|other)\s+\.pbub-bubble[^{}]*\{[^}]*background\s*:\s*(?:none|transparent|rgba\([^)]*,\s*0(?:\.0*)?\s*\))/i.test(t);
        if (clearBg) out.push('泡泡的底被設成透明，字會直接壓在聊天背景圖上');
        // 底是漸層／圖片，尖角卻還留著純色 → 接縫
        const gradBg = /\.pbub-(?:me|other)\s+\.pbub-bubble[^{}]*\{[^}]*background(?:-image)?\s*:[^;}]*(?:gradient|url\()/i.test(t);
        const tailOff = /--pbub-tail-size\s*:\s*0/i.test(t) || /\.pbub-bubble\s*::?before[^{}]*\{[^}]*content\s*:\s*none/i.test(t);
        const tailRedrawn = /\.pbub-(?:me|other)\s+\.pbub-bubble\s*::?before/i.test(t);
        if (gradBg && !tailOff && !tailRedrawn) out.push('泡泡底色是漸層但尖角還是純色，接縫會露出來');
        // 整份沒有任何塑形 ＝ 又退回「兩個圓角矩形換顏色」
        // 🚨圓角走 --pbub-*-radius 變數也算塑形——prompt 推薦的就是這個寫法，
        //   只認 border-radius 會把照著做的那些主題全部誤報成「沒有塑形」。
        const shaped = /clip-path\s*:\s*(?!none)/i.test(t)
            || /border-image\s*:/i.test(t)
            || /(?:border|--pbub-(?:me|other))-radius\s*:\s*[^;}]*(?:\d+(?:px|%)[^;}]*){2,}/i.test(t)
            || /-webkit-mask|(?:^|[^-])mask(?:-image)?\s*:/i.test(t);
        if (!shaped) out.push('整份沒有任何塑形：泡泡還是四個一樣的圓角');
        // 只做了一側
        const hasMe = /\.pbub-me\s+\.pbub-bubble/i.test(t);
        const hasOther = /\.pbub-other\s+\.pbub-bubble/i.test(t);
        const hasVars = /--pbub-(?:me|other)-/i.test(t);
        if (!hasVars && hasMe !== hasOther) out.push('只設計了其中一側，另一側還是預設的樣子');
        return [...new Set(out)];
    }

    // ── 對話紀錄與還原堆疊：跟設定一樣按聊天室分開 ─────────────────
    const _chatKey = (id) => 'wx_bubble_chat::' + (id || 'default');
    const _undoKey = (id) => 'wx_bubble_undo::' + (id || 'default');
    function chatLoad(id) { try { return JSON.parse(localStorage.getItem(_chatKey(id)) || '[]'); } catch (e) { return []; } }
    function chatSave(id, arr) { try { localStorage.setItem(_chatKey(id), JSON.stringify((arr || []).slice(-30))); } catch (e) {} }
    function chatClear(id) { try { localStorage.removeItem(_chatKey(id)); } catch (e) {} }
    function undoLoad(id) { try { return JSON.parse(localStorage.getItem(_undoKey(id)) || '[]'); } catch (e) { return []; } }
    function undoSave(id, arr) { try { localStorage.setItem(_undoKey(id), JSON.stringify((arr || []).slice(-8))); } catch (e) {} }

    // ── 叫 AI ──────────────────────────────────────────────────────
    // 🚨走「主模型」：這是設計工作，不是照規格填欄位。副模型做這個做出來就是
    //   「兩個矩形換顏色」——跟創作室的 VN 主題同一個道理。
    function ask(opts) {
        const o = opts || {};
        const api = win.OS_API || window.OS_API;
        const chat = (api && typeof api.chatMain === 'function') ? api.chatMain.bind(api)
            : (api && typeof api.chatSecondary === 'function') ? api.chatSecondary.bind(api) : null;
        if (!chat) { o.onError && o.onError(new Error('AI 不可用，請先到設置把主模型設好')); return; }

        const msgs = [{ role: 'user', content: CHAT_PROMPT }];
        (o.log || []).slice(-7, -1).forEach(m => msgs.push(m.role === 'user'
            ? { role: 'user', content: m.text }
            : { role: 'assistant', content: '（已更新泡泡 CSS）' }));
        msgs.push({
            role: 'user',
            content: '【目前的 CSS】\n```css\n' + (o.currentCss || '(還沒有，這是第一版)') + '\n```\n\n【這次要改】' + (o.text || '')
        });

        let config = {};
        try { config = (win.OS_SETTINGS && win.OS_SETTINGS.getConfig) ? win.OS_SETTINGS.getConfig() : {}; } catch (e) {}
        chat(msgs, config, null,
            (full) => {
                const got = pickCss(String(full || ''));
                const lk = stripLayout(got.css);
                o.onDone && o.onDone({
                    css: lk.css,
                    note: got.note,
                    cut: got.cut,
                    stripped: lk.hit,
                    warns: lk.css ? risky(lk.css) : []
                });
            },
            (err) => { o.onError && o.onError(err); },
            { label: '泡泡主題:' + (o.chatId || '') }
        );
    }

    win.WX_BUBBLE_AI = {
        BASE_CSS, PROMPT, CHAT_PROMPT,
        pickCss, stripLayout, risky, boost, ask,
        chatLoad, chatSave, chatClear, undoLoad, undoSave
    };
    window.WX_BUBBLE_AI = win.WX_BUBBLE_AI;
})();
