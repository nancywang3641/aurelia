// ----------------------------------------------------------------
// [檔案] os_worldgate.js — 🌌 視差世界門③：愛麗絲的面板（2026-07-22）
// 職責：世界檔案庫（瀏覽頁）⇄ 種子抽選/世界詳情（操作頁）。
//   抽種子(燒1次副模型) → 展開世界+旅人候選(燒1次) → 條目落地【奧瑞亞-視差】書
//   → 旅人像素小人入大廳(走現有NPC對話軌道) → DIVE=切書+開場指令注入聊天。
//   重進舊世界=0次API(條目還在,直接DIVE)。
// 儲存：OS_DB app_data(appId=worldgate,不動schema)。
// 依賴：OS_DB/OS_API/OS_SETTINGS、AURELIA_WORLDGATE(②切書)、TavernHelper(寫世界書)、
//       LobbyStage._b(旅人小人,可缺=只是不出小人)。
// 入口：lobby_stage.startTalk 愛麗絲鉤子 → OS_WORLDGATE.openGate()；離開對話 closeGate()。
// 設計書：docs/parallax_worldgate_design.md
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[Worldgate③] 載入世界門面板...');
    const win = window.parent || window;
    const APP_ID = 'worldgate';
    const K_WORLDS = 'worlds';   // [{id,name,concept,genre,style,lure,danger,crisis,keys,entryText,travelers:[{name,job,persona,origin,skill,fit,goal,weakness,recruited}],visits,ts}]
    const K_CURRENT = 'current'; // 這個聊天室目前在哪個世界（世界 id；撤離清空）— world_rules_injector 依此翻模組條目
    const BOOK_PARA = '【奧瑞亞-視差】';
    const MAX_TRAVELER_SPAWN = 4;

    function _db() { return win.OS_DB || window.OS_DB; }
    async function _get(k, dflt, chatId) {
        try { const db = _db(); if (!db?.getAppData) return dflt; const v = await db.getAppData(APP_ID, k, chatId); return (v === undefined || v === null) ? dflt : v; }
        catch (e) { return dflt; }
    }
    async function _set(k, v, chatId) {
        try { const db = _db(); if (!db?.saveAppData) return; await db.saveAppData(APP_ID, k, v, chatId); } catch (e) { console.warn('[Worldgate③] 存檔失敗', k, e); }
    }
    // 🚨「現在在哪個世界」必須綁 chatId(同 AVS／頭像／通訊錄那套)：
    //   以前這一格存在 global，換聊天室它還是舊值 → 舊世界的條目一直亮著常駐燈，
    //   新聊天室生成世界時整份被餵進去。檔案庫(K_WORLDS)維持 global：世界清單與世界書條目本來就跨聊天室共用。
    function _cid() { try { const db = _db(); return (db?.currentChatId && db.currentChatId()) || ''; } catch (e) { return ''; } }
    async function _getCurrentId() { const c = _cid(); return c ? (await _get(K_CURRENT, '', c)) : ''; }
    async function _setCurrentId(v) { const c = _cid(); if (c) await _set(K_CURRENT, v, c); }
    // 舊資料搬家:把 global 那一格搬進「現在這個聊天室」，然後清掉。
    //   只做一次，其餘聊天室從乾淨狀態開始——所以絕不能在拿不到 chatId 時就清掉 global。
    async function _migrateCurrent() {
        try {
            const g = await _get(K_CURRENT, '');            // 不帶 chatId＝讀舊的 global 那一格
            if (!g) return;
            const c = _cid();
            if (!c) return;   // 聊天室還沒就緒 → 這輪不動，等 CHAT_CHANGED 再來
            if (!(await _get(K_CURRENT, '', c))) await _set(K_CURRENT, g, c);
            await _set(K_CURRENT, '');                     // 清掉 global，之後只認 chat-scope
            console.log('[Worldgate③] 目前世界已改綁 chatId:' + c);
        } catch (e) {}
    }
    function _th() { return win.TavernHelper || window.TavernHelper; }
    function _gate() { return win.AURELIA_WORLDGATE || window.AURELIA_WORLDGATE; }
    function _mkId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

    // ── 副模型呼叫(仿 os_cafe:優先副模型 config,失敗回 null 讓 UI 給重試) ──
    function _extractJSON(raw) {
        try { const m = String(raw || '').match(/[\[{][\s\S]*[\]}]/); return m ? JSON.parse(m[0]) : null; }
        catch (e) { return _salvageObjects(raw); }   // 被截斷 → 還是把已經寫完的那幾個撿回來
    }
    // 🚨JSON 被截斷時別整包丟掉:掃出所有「大括號成對且 parse 得過」的物件。
    //   四個旅人寫到第三個被切,以前是回空陣列→整批失敗→使用者手動重按(她實測連按三次都是這樣),
    //   現在至少拿得到前兩三個,不用再燒一次主模型。
    function _salvageObjects(raw) {
        const s = String(raw || '');
        const out = [];
        for (let i = 0; i < s.length; i++) {
            if (s[i] !== '{') continue;
            let depth = 0, inStr = false, esc = false;
            for (let j = i; j < s.length; j++) {
                const c = s[j];
                if (esc) { esc = false; continue; }
                if (c === '\\') { esc = true; continue; }
                if (c === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (c === '{') depth++;
                else if (c === '}') {
                    depth--;
                    if (depth === 0) {
                        try { const o = JSON.parse(s.slice(i, j + 1)); if (o && o.name) out.push(o); } catch (e) {}
                        i = j;   // 這顆處理完，從它後面繼續找
                        break;
                    }
                }
            }
        }
        if (out.length) console.warn('[Worldgate③] JSON 疑似被截斷,已搶救 ' + out.length + ' 筆');
        return out.length ? out : null;
    }
    function _stripFences(s) {
        return String(s == null ? '' : s).replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/```\s*$/, '').trim();
    }
    // 🚨模型會照著角色卡的系統規範多吐一堆附加模組(思考鏈/草稿/摘要/選項/免責聲明)。
    //   那些是給劇情用的,對世界檔案完全是垃圾——不清掉的話:①整包被當成世界正文寫進世界書條目
    //   ②下一支 API 又把它整包當「世界檔案」餵回去(實測送出字數從三千暴增到一萬三)
    //   ③輸出額度被附加模組吃掉 → 旅人 JSON 被截斷 → 召集失敗要重按 → 又是好幾次呼叫。
    function _cleanModelOutput(s) {
        let t = String(s == null ? '' : s);
        ['thinking', 'think', 'draft', 'branches', 'disclaimer', 'reasoning', 'plan'].forEach(tag => {
            t = t.replace(new RegExp('<' + tag + '[^>]*>[\\s\\S]*?<\\/' + tag + '>', 'gi'), '');
            t = t.replace(new RegExp('<\\/?' + tag + '[^>]*>', 'gi'), '');   // 只剩單邊標籤也清掉
        });
        const cm = t.match(/<content>([\s\S]*?)<\/content>/i);   // 有包 <content> 就只取裡面
        if (cm) t = cm[1];
        return t.replace(/<!--[\s\S]*?-->/g, '')                 // <!-- {} --> 這種殘留
                .replace(/\n{3,}/g, '\n\n').trim();
    }
    // asText=true:世界檔案正文近三千字,包進 JSON 字串太容易被引號/換行搞爆 parse → 直接收 markdown 純文字
    // 🚨stream:長輸出的那幾支一定要開。非串流是整篇生完才回第一個位元組,反代那條連線空掛著,
    //   實測世界檔案要寫七千多 token、跑 250~260 秒,反代 300 秒整掐斷 → 502 upstream request failed。
    //   短的那支(抽種子,三十秒)不必開,維持原樣。
    // onChunk:串流途中每收到一塊就被叫一次,參數是「到目前為止的全文」(不是增量)。
    //   只有選了連接 profile 的人真的會串流,其餘路徑送出去也是整篇才回 → onChunk 從頭到尾不觸發,行為同以往。
    async function _callAI(prompt, label, route, useMain, asText, stream, onChunk) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return null;
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                if (useMain) {
                    config = OS.getConfig() || {};   // 主模型:展開世界=正文+四張身分卡+考題包,重活別省
                } else {
                    const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                    config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
                }
            }
            // 複製再改:config 是 getConfig()/getSecondaryConfig() 回傳的,直接改等於動到設定本身。
            config = Object.assign({}, config || {}, { route });
            // 長輸出那幾支保底 8192:副模型的預設額度只有 1000,旅人那包 JSON 會被印到一半 → 整份 parse 失敗。
            // 不動使用者填的數值本身,只在這一趟呼叫拉高(同 chatMain 的做法)。
            if (stream === true) {
                const _mt = parseInt(config.maxTokens);
                if (isNaN(_mt) || _mt < 8192) config.maxTokens = 8192;
            }
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, (typeof onChunk === 'function' ? onChunk : null), resolve, reject, { label, keepCodeFences: true, stream: stream === true });
            });
            return asText ? _stripFences(raw) : _extractJSON(raw);
        } catch (e) { console.warn('[Worldgate③] ' + label + ' 失敗', e); return null; }
    }

    // ── 種子抽選(1次API→4顆種子;hint=玩家偏好詞可空) ──
    async function _drawSeeds(hint) {
        const prompt =
            '你是一位資深的跑團世界觀設計師,替玩家設計可以長期生活、探索的異世界。請生成 4 顆世界種子。只回傳純 JSON 陣列:\n' +
            '[{"genre":"{題材類型,不超過8字,例如:劍與魔法/仙俠修真/神話史詩/海洋與深淵/蒸汽工業/民俗怪談}","type":"{基調,不超過6字}","name":"{世界名,不超過8字,有記憶點}","concept":"{一句話概念,不超過25字}","twist":"{一條違反常識的核心規則,不超過45字}","daily":"{這條規則讓當地人每天實際在做什麼,不超過25字}","style":"{視覺風格,名詞短語,不超過5字}","lure":"{這個世界最吸引人的那樣東西,名詞短語,不超過5字}","danger":"{主要危險,名詞短語,不超過5字}","crisis":"{這個世界現在正在發生、玩家會撞上的事,不超過20字}"}]\n' +
            // 🚨type 一樣不給清單(理由同下面 twist 那段)。只講它是哪一個維度、以及四顆要拉開。
            '【基調 type】type 跟 genre 是兩件事:genre 是題材,type 是玩家住進去會過什麼樣的日子、故事讀起來是什麼味道。不要把題材再寫一次當 type。\n' +
            '4 顆種子的 type 必須明顯不同,而且**不是每個世界都要背著沉重的使命或世界級危機**——至少要有一顆是低風險、可以慢慢過日子的走向。\n' +
            // style/lure/danger 是面板上的三顆標籤(印在概念圖上),不是句子。放寬字數它就會寫成短句、
            //   標籤直接撐爆整排(舊世界的「幸福感作為通用貨幣」就是這樣長出來的)。
            '【標籤 style / lure / danger】這三個是印在世界概念圖上的短標籤,只寫名詞短語,不要動詞、不要句子、不要標點。\n' +
            'danger 與 crisis 的量級要跟著 type 走:輕鬆或日常向的世界就寫當地人真的在煩惱的小事,不要硬套災難;沉重或高風險的才寫大危機。世界不會因為沒有末日就不值得去。\n' +
            (hint
                ? '【題材鎖定,硬性要求】玩家指定:「' + hint + '」。4 顆種子的 genre 全部都要落在這個題材裡,不准有任何一顆跑題。差異體現在基調、地域、文明、勢力、核心規則與危機上,不是靠換題材製造差異。\n'
                : '【題材分配】4 顆種子的 genre 要分屬四種不同題材,且至少 3 顆是非科幻題材(劍與魔法、仙俠修真、神話史詩、海洋與深淵、蒸汽工業、民俗怪談、荒野拓荒、宮廷權謀、妖怪異聞等,不限於此)。不要每次都往科技或未來的方向靠。\n') +
            '【用詞守則】世界名、地名、貨幣、職業、勢力、規則全部都要用該題材自己的語彙。除非題材本身就是科幻,否則不得出現系統、數據、程式、介面、協議、迴路、晶片、義體、賽博等科技說法,也不要把世界寫成模擬空間或遊戲副本——它就是一個真實存在的世界。\n' +
            // 🚨別在這裡列「領域清單」或造句範例:模型會直接照著清單輪流填,四顆種子就變成同一個模子印的。
            //    只描述要什麼特質、以及不要哪一種句型,把想法留給模型自己長。
            'twist 是種子的靈魂,必須是「規則」不是「景觀」:一條會左右這裡的人怎麼謀生、怎麼往來的規矩,不是只是看起來奇特。\n' +
            // 🚨這裡以前寫「這裡的人被什麼事情限制住、因此不得不怎麼做」,結果四顆種子全變成
            //    「全民禁止某事＋所有人每天做某個服從動作」——整個世界只剩遵守與違反,沒得探險。
            'twist 不可以是「全體禁止某件事」或「所有人都必須做某個動作」這種一體適用的禁令。' +
            '那種世界走到哪裡都在應付同一條規定,除了守規矩之外沒別的事可做。' +
            '這裡的日常——吃住、走路、講話、做買賣——本來就該是通的,規則只改變其中一部分,不是把生活整個換成服從流程。\n' +
            'twist 要打開可能性,不是關掉:它應該讓這個世界長出別處沒有的行當、生意、糾紛與機會,' +
            '是玩家可以利用、交易、鑽空子、拿來解決問題的東西,不是一條他只能服從的規定。\n' +
            '寫 twist 時不要用「某個抽象概念等於、變成或存放在某個具體東西」的句型——那是同一個套路換皮,四顆並排會像同一個模子印出來的。句子裡要看得見人在做什麼,不是只有一個奇觀設定。\n' +
            '4 顆種子的 twist 不可以是同一種句型,也不要全都圍著同一件事打轉。用該題材自己的語言寫。\n' +
            'daily 寫的是這條規矩讓當地人多出了什麼營生、什麼往來、什麼熱鬧,不是他們為了守規矩而做的例行動作。具體到看得見場面,不要抽象形容。\n' +
            '世界必須適合多目的探索(可戰鬥/解謎/交易/採集/調查/純閒逛),不要設計成單一主線。語言:繁體中文。';
        const arr = await _callAI(prompt, '世界門抽種子', 'worldgate_seeds');
        return (Array.isArray(arr) ? arr : []).filter(s => s && s.name).slice(0, 5);
    }

    // ── 展開世界(主模型,2次API):①世界檔案正文十節1800~2600字 ②四名旅人身分卡+偶遇考題包 ──
    //    分兩次是因為兩份加起來遠超單次輸出上限,擠在一起=旅人考題必被截斷(整包 JSON 一起報廢)。
    //    正文改收 markdown 純文字(不包 JSON 字串),近三千字的引號換行不會再搞爆 parse。
    function _genreLine(seed) {
        return '【題材】' + String(seed.genre || seed.style || '') + '——專有名詞、貨幣、職業、勢力、危機、風景全部都要落在這個題材裡,一個字都不准跑題。' +
            '除非題材本身就是科幻,否則不得出現系統、數據、程式、介面、協議、迴路、裝備艙、探勘隊這類科技或現代說法。\n';
    }
    // 🚨基調要跟著種子一路帶下去:下面的十節規格本身很重(正史、勢力邦交、危機引擎),
    //    不特別壓住的話,一個輕鬆向的種子會被規格硬拉回史詩災難片。
    function _toneLine(seed) {
        const t = String((seed && seed.type) || '').trim();
        return t ? '【基調】' + t + '——每一節的取材、事件量級與敘述口吻都要維持這個基調。' +
            '危機與危險的規模要跟基調相稱:輕鬆或日常向就把衝突留在人與人之間的小麻煩,不要升級成世界存亡;' +
            '沉重或高風險向才鋪大災難。不要因為規格裡有「危機」欄位就硬寫一場浩劫。\n' : '';
    }
    const _WORLD_SECTIONS =
        '## 一、世界總覽\n世界名 / 一句話概念 / 題材與視覺風格 / 核心法則(把種子的 twist 落實成完整規則:它如何滲透職業、買賣、社交、日常,至少兩種因它而生的行當或生意,一般人怎麼跟它相處而不是天天對抗它,以及踩過頭時會付出什麼代價) / 這個世界現在正在發生的事 / 住在這裡的人各自在追求什麼(不同的人追求不同的東西,不要寫成一個所有人共同的目標,也不要寫成指派給玩家的任務)。\n' +
        // 🚨這節以前寫「走過去要多久」「從哪裡能走去哪裡」,模型照著字面辦事——會飛的種族全程用走的、
        //   水底世界也在趕路。誘導詞換成中性的說法,移動方式交給下面【起居】那條由世界自己決定。
        '## 二、世界地圖\n先用一段話交代區域之間的相對位置與通行關係(誰接壤誰、往來一趟要多久、路上會遇到什麼),再逐一寫入口區與另外 2~3 個區域,每區都要有:名稱 / 類型(降生地、城市、荒野、邊境、禁區) / 樣貌與環境 / 由誰控制 / 能取得什麼物資 / 能做什麼 / 主要危險 / 通往哪些區域 / 移動需要的條件或代價。要讓人看得出「從哪裡能到哪裡、靠什麼過去」,不是幾個漂浮的地名。\n' +
        '## 三、降生點與初始配置\n玩家降生時看到的第一幕 / **世界法則把他的身體改造成什麼**(這一項要寫滿:改成什麼樣的身體、哪裡跟原本不同、他自己第一次意識到時的反應) / 當地人怎麼理解他的身分 / 身上的衣著與裝備 / 初始貨幣與物資 / 身體能力與限制 / 需要盯著的生存數值(挑真的會影響行動的:飢餓、體溫、氧氣、汙染、聲望等) / 最快賺到第一筆錢的方法 / 初期能安全落腳的地方 / 他必須保護、隱藏或完成的事。\n' +
        '## 四、社會結構\n統治方式 / 階級與身分制度 / 主要職業 / 資源由誰生產、控制、分配 / 法律、執法者與刑罰 / 宗教或主流信仰 / 普通人一天怎麼過 / 外來者能怎麼往上爬。勢力是演員,社會結構才是舞台——不准只寫兩個勢力對立就當交代完。\n' +
        '## 五、社會常識\n當地人從小就知道、外來者最容易踩雷的事:日常禮儀 / 禁忌 / 危險徵兆 / 常見騙局 / 通用暗語或俗諺 / 找活、住宿、交易的規矩 / 對死亡、婚姻、親屬、財產的看法 / 哪些舉動會立刻讓人看出他是外來者。這節直接決定 NPC 講不講人話,要具體到可以照著演,不要寫成抽象形容。\n' +
        '## 六、經濟與生活\n貨幣名與來源 / 基本物價 / 住宿、醫療、交通的價格 / 尋常委託的報酬 / 黑市行情 / 稀有物品價格 / 戰利品賣給誰、怎麼賣 / 玩家每天最低生存成本。數字要能直接拿來跑團結算。\n' +
        '## 七、勢力與邦交\n3~4 個主要政權或勢力,每個都要有:控制地域 / 公開目標 / 真正想要的東西 / 能提供玩家什麼 / 要玩家付出什麼 / 與其他勢力的關係(貿易、戰爭、停戰、聯姻) / 玩家能利用的矛盾。就算這個世界沒有「國家」,也要用城邦、部族、教團、商會之類的東西替代,不准整片世界只有兩幫人互瞪。\n' +
        '## 八、世界正史\n3~5 個歷史節點串成一條因果鏈,每個寫:事件名稱與年代 / 發生了什麼 / 誰因此獲利 / 誰被犧牲 / 留下什麼遺跡、制度或仇恨 / 它今天怎麼影響玩家。重點不是年表,是每段歷史都要留下今天還碰得到的後果。\n' +
        '## 九、核心人物\n3~4 位本世界的重要人物(本地人,不是同行旅人),每位寫:姓名與公開身分 / 所屬勢力 / 外在形象 / 真正的欲望 / 掌握的資源或秘密 / 最害怕失去什麼 / 與其他核心人物的關係 / 對玩家的初始態度 / 在什麼條件下會變成盟友、敵人或委託人。\n' +
        '## 十、這個世界自己在轉的事\n這裡的人本來就在忙的事情(跟玩家無關也照樣發生) / 5~7 個彼此獨立、玩家想碰才碰的機會或麻煩,每個都要有「誰在乎它」和「不管它會怎樣(答案可以是沒怎樣)」 / 戰鬥、調查、交易、採集、社交在這個世界各自能做什麼 / 這裡值得帶走的東西 / 要離開這個世界需要什麼條件(用世界自己的說法,例如渡口、歸門、季風、儀式) / 玩家下次再進來時,世界可能已經自己變成什麼樣。\n' +
        // 🚨最後一條壓在規格尾巴:上面每一節都在給素材,不加這句的話 AI 會把它們排成一條主線推給玩家
        '## 收尾要求\n以上十節是「這個地方的樣子」,不是給玩家的任務清單。世界法則、危機、鉤子都只是擺在那裡的東西,玩家可以全部不理、只在這裡做生意或閒晃過日子,世界照樣運轉。不要安排一條非走不可的主線,不要把核心法則寫成玩家必須解決或必須遵守才能推進的關卡,也不要指定玩家該站在哪一邊。\n';
    // 玩家在選種子時填的追加要求。措辭要硬:寫成「可參考」會被當裝飾忽略(抽種子那邊的偏好詞就吃過這個虧)。
    function _noteLine(note) {
        note = String(note || '').trim();
        if (!note) return '';
        console.log('[Worldgate③] 已帶入玩家的追加要求:', note);   // 「我明明填了卻沒生效」時,先看這行有沒有印出來
        return '【玩家的追加要求·最高優先】' + note +
            '——這是玩家指定要有的東西。上面所有規格與鐵則若與它衝突,一律以這裡為準。' +
            '必須落實在世界裡並貫穿相關章節,不可以只在某一句話裡提一下就算數。\n';
    }
    async function _expandWorldText(seed, note) {
        const prompt =
            '你是一位資深的跑團世界觀設計師。請把以下世界種子擴寫成一份可以直接拿來跑團的世界檔案。\n' +
            _genreLine(seed) +
            _toneLine(seed) +
            '【世界種子】' + JSON.stringify(seed) + '\n' +
            '【輸出格式】直接輸出檔案正文,用下列標題分節,不要 JSON、不要程式碼區塊、不要開場白或結語。總長 1800~2600 字,十節依序寫完,每節都要有實質內容,不准只留標題或用一句話帶過。\n' +
            _WORLD_SECTIONS +
            '【鐵則】這是給人「住進去生活」的世界,不是觀光手冊:每個設定都要能回答「玩家能拿它做什麼」。' +
            // 🚨這裡以前列了三種人類社會角色當範本,結果把「玩家會被改造成什麼」整條蓋掉——
            //    玩家永遠是人類、還被寫成潛水員(連負面提到的「潛水隊」都會被叫出來)。改成只講關係、不給身分範本。
            '玩家是被世界法則接住的外來者,不是外面派來執行任務的隊伍,這個世界不是一趟出差。當地社會會用他們自己的說法解釋他是什麼、從哪來,把他放進既有的位置。\n' +
            // 身體改造獨立成鐵則:埋在第三節的斜線清單裡份量不夠,壓不過其他規格。
            // 🚨玩家和四位同行旅人都是奧瑞亞的人類(現實層),進到世界裡才被改造成該世界的形態——
            //    同一套法則要套在全部進來的人身上,不是只有主角變、旅人還是人。
            '【身體】玩家與同行旅人都是從奧瑞亞進來的人類,落地時世界法則會把他們的身體改造成能在這裡活下去的樣子。' +
            '這副身體是進到這個世界才有的,不是他們原本的模樣;同一套法則套用在所有進來的人身上,不會只改主角一個。' +
            '如果這個環境對人類根本活不下去,那就必須改造,不准用護具、載具或某種道具讓人類身體照樣通行——那等於這個世界沒有法則。' +
            '改造成什麼由世界自己的邏輯決定,並且要跟第三節、第五節(當地人怎麼看待他們)、第六節(他們因此能做什麼工作)對得上。\n' +
            // 🚨不給例子只講性質:寫「水裡的人吃生食」「會飛的人不走樓梯」那種範例,模型抄的是形狀不是意思,
            //    下一個世界照樣端出同一套。這裡只點出「哪些事要重新想過」,答案交給世界自己的條件去推。
            '【起居】這裡的人是什麼樣的身體、住在什麼樣的環境、手上有什麼樣的移動與運輸手段,決定了他們最平常的事怎麼做:' +
            '怎麼往來與進出、怎麼取得食物又怎麼吃下去、怎麼安置身家、怎麼算距離與時間。' +
            '這些都要從這個世界自己的條件推出來,不要沿用人類在陸地上、在現代生活裡的預設做法。' +
            '聚落與建築是照住在裡面的多數人的身體蓋的,只有少數例外才需要另外準備設施。' +
            '這一項不必獨立成段,融進相關章節就好。\n' +
            '寧可少一個區域,不可少掉價格、循環與常識。\n' +
            // 🚨玩家的追加要求放最後:放前面的話後面隔著兩千多字規格才輪到下筆,權重被稀釋到等於沒寫。
            _noteLine(note) +
            // 給程式讀的四行分成前後兩個區塊。
            // 🚨兩張生圖關鍵詞改成寫在「正文之前」:正文要跑兩百多秒,關鍵詞先到就能一邊寫正文一邊把圖生好
            //   (同 VN 頭像早鳥搭串流便車那招)。擺在結尾等於整篇寫完才拿得到,提前量是零。
            //   代價:模型是還沒寫正文就先描述畫面,只能依種子推,不像寫完再回頭挑那麼貼——所以這裡要它照種子的地貌與氛圍寫。
            // 🚨同一個區塊裡的行必須綁在一起講。分開寫、各自標「只輸出這一行」的話,模型吐完第一行就當任務結束,
            //   第二行永遠是被漏掉的那個(實測:十節九千多字全寫完、關鍵字有、降生地整行不存在)。
            '【輸出順序】依序輸出三段:開頭兩行資料、世界檔案正文、結尾兩行資料。四行都必須有、缺一不可。\n' +
            // 這兩行是拿去生圖的,所以要英文關鍵詞;構圖與畫風由程式端補,這裡只寫「畫面裡有什麼」。
            '開頭第一行 概念圖:依世界種子的地貌與氛圍,用英文關鍵詞描述這個世界最具代表性的一幅遠景——地貌、建築樣式、天色與氣氛,' +
            '12~20 個詞、逗號分隔,只寫看得見的東西,不要寫人物、招牌文字、畫風或畫質詞\n' +
            '開頭第二行 方位圖:用英文關鍵詞描述從高空俯瞰整片疆域的樣子——各區域的地形怎麼分布、彼此怎麼相接,' +
            '10~16 個詞、逗號分隔,同樣不要人物與文字\n' +
            // 🚨「不要加標題」會被連行首那三個字一起省掉:實測模型把兩行英文關鍵詞光禿禿地寫出來、
            //   四行標籤全不見(連結尾的關鍵字/降生地也被這股潔癖感染),程式端整組解析失敗。
            //   所以這裡要正面講「行首那幾個字是必須寫的」,別只講不要什麼。
            '這兩行的行首必須原樣寫出「概念圖:」與「方位圖:」這幾個字,程式要靠它認行;除了行首這幾個字之外不要加標題、編號或說明,寫完直接接著寫世界檔案正文。\n' +
            '正文全部寫完後,再補上結尾兩行,同樣要原樣寫出行首的「關鍵字:」與「降生地:」:\n' +
            '結尾第一行 關鍵字:世界名、其他2~4個本世界專有名詞(頓號分隔,不要加任何其他文字)\n' +
            '結尾第二行 降生地:名稱|方位|一句話 / 名稱|方位|一句話 / …(給 3~4 個,斜線分隔;方位只能是 北/南/東/西/東北/東南/西北/西南/中央 其中一個;' +
            '這些是第二節寫過的區域裡,適合玩家第一次落地的地方,各自感覺要明顯不同;一句話寫「在這裡開場會看到什麼」,不超過20字)\n' +
            '語言:繁體中文。';
        _earlyStart();   // 🐣 這一趟的早鳥開張:串流一吐出概念圖那行就開生,不等正文寫完
        let text = _cleanModelOutput(await _callAI(prompt, '世界門展開世界', 'worldgate_expand', true, true, true, _earlyScan));
        if (!text) return null;
        // 截斷保險:尾巴那節沒寫到就接著補完(整份重生太貴,也會換一套設定)
        // 🚨判斷一定要在「清乾淨之後」的文字上做,而且別綁節名——節名改過一次(冒險引擎→自己在轉的事),
        //    舊字串比對不到就會每次都誤判成截斷、白白多燒一次主模型。
        // 🚨這裡也不能只認標籤:模型省略標籤時會被誤判成截斷,白燒一次續寫。
        //   降生地那行帶 | 與 / 的長相最好認,拿它當第二道判準。
        const _tail = text.slice(-800);
        if (!/關鍵字[:：]|降生地[:：]/.test(_tail) &&
            !_tail.split('\n').some(s => s.indexOf('|') >= 0 && s.indexOf('/') >= 0)) {
            console.warn('[Worldgate③] 世界檔案疑似被截斷,續寫補完');
            const more = await _callAI(
                '以下是一份寫到一半的跑團世界檔案。請直接接著往下寫完剩下的段落,不要重複已經寫過的內容,不要開場白或結語,不要重寫標題以外的舊段落。' +
                '完整節次如下(缺哪節補哪節):\n' + _WORLD_SECTIONS +
                '全部寫完後,最後補上兩行給程式讀的資料,兩行都必須有、缺一不可、順序如下:\n' +
                '第一行 關鍵字:世界名、其他2~4個本世界專有名詞(頓號分隔)\n' +
                '第二行 降生地:名稱|方位|一句話 / …(給 3~4 個,斜線分隔;方位只能是 北/南/東/西/東北/東南/西北/西南/中央 其中一個)\n' +
                _genreLine(seed) + '語言:繁體中文。\n\n【已寫好的部分】\n' + text,
                '世界門續寫檔案', 'worldgate_expand', true, true, true);
            if (more) text += '\n' + _cleanModelOutput(more);
        }
        const r = _parseProgramLines(text);
        const keys = r.keys;
        if (!keys.length || keys[0] !== seed.name) keys.unshift(seed.name);
        return { text: r.text, keys: keys.slice(0, 5), spawns: r.spawns, artPrompt: r.artPrompt, mapPrompt: r.mapPrompt };
    }
    // ── 四行程式資料的解析(解析完一律從正文剝掉,留著會被主持AI當成劇情念出來) ──
    // 🚨不能只認行首標籤:模型會把「概念圖:」這種行首當成「標題」一起省掉,
    //   實測整份四行全禿——兩行光禿禿的英文關鍵詞、結尾兩行也沒了標籤,程式端整組解析失敗、一張圖都沒生。
    //   所以每一行都是兩道:先認標籤,認不到再靠位置與長相認。
    function _isArtLine(s) {   // 生圖關鍵詞行:沒有中文、逗號夠多、有一定長度
        const t = String(s || '').trim();
        if (t.length < 20 || /[一-鿿]/.test(t)) return false;
        return (t.match(/,/g) || []).length >= 4;
    }
    function _isKeysLine(s) {  // 關鍵字行:短、有中文、頓號分隔,而且不是降生地那種帶 | 的行
        const t = String(s || '').trim();
        if (!t || t.length > 60 || t.indexOf('|') >= 0) return false;
        if (!/[一-鿿]/.test(t)) return false;
        if (/[。!?！？:：#*]/.test(t)) return false;   // 句子或標題不算
        return t.indexOf('、') >= 0;
    }
    function _parseProgramLines(text) {
        const lines = String(text || '').split('\n');
        const tagged = (re) => {   // 有標籤:抽出值,那行剩下空白就整行刪掉
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(re);
                if (!m) continue;
                const v = m[1].trim();
                const rest = lines[i].replace(m[0], '').trim();
                if (rest) lines[i] = rest; else lines.splice(i, 1);
                return v;
            }
            return '';
        };
        const byShape = (test, from) => {   // 沒標籤:在規定的位置附近照長相認
            const idx = [];
            lines.forEach((s, i) => { if (test(s)) idx.push(i); });
            const hit = from === 'head' ? idx.filter(i => i < 6) : idx.filter(i => i >= lines.length - 8);
            if (!hit.length) return '';
            const i = from === 'head' ? hit[0] : hit[hit.length - 1];
            const v = lines[i].trim();
            lines.splice(i, 1);
            return v;
        };
        // 開頭兩行(生圖關鍵詞):第一條是概念圖、第二條是方位圖——沒標籤時就靠這個順序
        const artPrompt = (tagged(/概念圖[:：]\s*(.+)/) || byShape(_isArtLine, 'head')).slice(0, 400);
        const mapPrompt = (tagged(/方位圖[:：]\s*(.+)/) || byShape(_isArtLine, 'head')).slice(0, 400);
        // 結尾兩行:降生地先抓(帶 | 的長相最好認,免得被當成關鍵字撿走)
        const spawnLine = tagged(/降生地[:：]\s*(.+)/) ||
            byShape(s => s.indexOf('|') >= 0 && s.indexOf('/') >= 0, 'tail');
        const keysLine = tagged(/關鍵字[:：]\s*(.+)/) || byShape(_isKeysLine, 'tail');
        return {
            text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
            keys: keysLine ? keysLine.split(/[、,，\/]+/).map(s => s.trim()).filter(Boolean).slice(0, 5) : [],
            spawns: spawnLine ? _parseSpawns(spawnLine) : [],
            artPrompt, mapPrompt,
        };
    }
    // 降生地選擇：純 CSS 的九宮格方位圖（不生任何圖、不打任何 API）
    //   舊世界沒有 spawns 欄位 → 整塊不顯示，行為跟以前一樣（落點交給主持AI）
    const _DIR_CELL = { 西北: 1, 北: 2, 東北: 3, 西: 4, 中央: 5, 東: 6, 西南: 7, 南: 8, 東南: 9 };
    // 方位撞格或根本沒方位時的補位順序（中央→四正→四隅）：AI 給兩個「北」不能讓第二個憑空消失
    const _CELL_ORDER = [5, 2, 6, 8, 4, 3, 9, 7, 1];
    function _spawnCells(list) {
        const cells = new Array(10).fill(null);
        const rest = [];
        for (const s of list) {
            const c = _DIR_CELL[s.dir];
            if (c && !cells[c]) cells[c] = s; else rest.push(s);
        }
        for (const s of rest) {
            const c = _CELL_ORDER.find(i => !cells[i]);
            if (c) cells[c] = s;
        }
        return cells;
    }
    // 退路：模型漏掉結尾那行（或世界是加這功能之前展開的）→ 從世界檔案第二節把區域撈出來當候選。
    //   零 API，只讀已經寫好的正文；括號註記裡帶方位就照方位排，沒有就補位。不寫回 spawns（那欄只放模型真的給過的）。
    function _spawnsFromText(text) {
        const m = String(text || '').match(/##\s*二[、,.．][^\n]*\n([\s\S]*?)(?=\n##\s|$)/);
        const body = m ? m[1] : '';
        if (!body) return [];
        const out = [];
        const re = /^\s*\*\*(.+?)\*\*\s*$/gm;   // 區域標題自成一行的粗體
        let x;
        while ((x = re.exec(body)) && out.length < 4) {
            const raw = x[1].trim();
            if (/^類型|^[一二三四五六七八九十]、/.test(raw)) continue;   // 欄位標籤不是區域名
            const pm = raw.match(/^(.+?)[（(](.+?)[)）]\s*$/);
            const name = (pm ? pm[1] : raw).trim();
            const tag = pm ? pm[2] : '';
            if (!name || name.length > 12) continue;
            const dir = _DIRS.find(d => d.length === 2 && tag.includes(d))
                     || _DIRS.find(d => d.length === 1 && tag.includes(d)) || '';
            const after = body.slice(x.index + x[0].length, x.index + x[0].length + 80);
            const tm = after.match(/類型[:：]\s*([^\n。．,，、]{1,8})/);
            out.push({ name: name.slice(0, 12), dir, note: (tm ? tm[1] : tag).slice(0, 12) });
        }
        return out;
    }
    function _spawnHtml(w, entryText) {
        let list = Array.isArray(w.spawns) ? w.spawns : [];
        if (!list.length) list = _spawnsFromText(entryText);
        if (!list.length) return '';
        const grid = _spawnCells(list);
        const cells = [];
        for (let i = 1; i <= 9; i++) {
            const s = grid[i];
            cells.push(s
                ? '<div class="wg-spawn' + (w.spawn === s.name ? ' on' : '') + '" data-n="' + _esc(s.name) + '" title="' + _esc(s.note || '') + '">' +
                    '<span class="wg-spawn-n">' + _esc(s.name) + '</span>' +
                    (s.note ? '<span class="wg-spawn-s">' + _esc(s.note) + '</span>' : '') +
                  '</div>'
                : '<div class="wg-spawn-empty"></div>');
        }
        return '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-location-dot"></i> 降生地</span>' +
                 '<span class="wg-section-note" data-spawn-tip>' + (w.spawn ? '降生地：' + _esc(w.spawn) : '沒選＝落在哪由主持AI安排') + '</span></div>' +
               // 方位圖墊在格子底下(圖是動態網址,只能由 JS 設成 CSS 變數);沒生出圖就是原本的樣子
               '<div class="wg-spawn-grid' + (w.mapArt ? ' has-map' : '') + '" data-spawn-grid>' + cells.join('') + '</div>';
    }
    // 「名稱|方位|一句話 / 名稱|方位|一句話」→ [{name,dir,note}]
    // 方位認不得就給 '中央'（版面照樣排得出來，不會因為 AI 亂寫就整個功能壞掉）
    const _DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北', '中央'];
    function _parseSpawns(line) {
        return String(line || '').split(/\s*\/\s*/).map(seg => {
            const p = seg.split(/\s*[|｜]\s*/).map(s => s.trim());
            const name = (p[0] || '').replace(/^[\s\-—•]+/, '').replace(/^\d+\s*[.、)]\s*/, '').trim();
            if (!name) return null;
            const dir = _DIRS.indexOf(p[1]) >= 0 ? p[1] : '中央';
            return { name: name.slice(0, 12), dir, note: String(p[2] || '').slice(0, 24) };
        }).filter(Boolean).slice(0, 4);
    }
    async function _expandTravelers(seed, worldText, note) {
        const prompt =
            '你是一位資深的跑團角色設計師。以下是玩家即將前往的世界檔案,請生成 4 位正在純白大廳等待組隊、準備前往這個世界的同行旅人。\n' +
            _toneLine(seed) +   // 喜劇向的世界配四段悲愴身世會很出戲
            _noteLine(note) +
            '他們是視差玩家(來自奧瑞亞的普通人),不是這個世界的原住民;世界檔案第九節的核心人物不算在內,不可重複。性格差異明顯。\n' +
            // 🚨這四個人是各自報名、在大廳湊在一起的陌生人,不是一支照著世界主題配好的專業小隊。
            //   沒有下面這組配額的話,模型會讓四個人的職業全部咬合這個世界的題材(藝術世界配四個藝術從業者),
            //   而且一律往需要學歷的專業人士靠——出來的不是組隊,是跟團出行。
            '四人的社會位置、年齡層、來歷要明顯拉開,不是一支功能互補的專業小隊。以下配額必須全部滿足:\n' +
            '- 職業跟這個世界的題材直接相關的,最多一人。其餘三人的本行與這個世界無關,是被別的東西吸引來的。\n' +
            '- 至少兩人的職業不需要專業訓練或學歷。\n' +
            '- 至少一人來這裡沒有正當理由,動機講出來顯得沒什麼份量,他就只是想來。\n' +
            '只回傳純 JSON:\n' +
            '{"travelers":[{"name":"{旅人名}","job":"{職業,不超過6字,普通人在做的工作}","persona":"{一句話性格}","origin":"{一句話來歷}",' +
            '"skill":"{一句話擅長,可以是專業本事,也可以只是生活裡練出來的小能力}","look":"{一句話外貌印象}","record":"{一句話視差資歷}",' +
            '"reason":"{一句話前往此世界的動機,份量可輕可重}",' +
            '"fit":"{他跟這個世界的關係,一句:可以正好對上,也可以完全不搭、甚至是會出事的錯位}","weakness":"{明確的弱點,一句,要能在跑團裡出事}","goal":"{他自己的個人目標,一句}",' +
            '"clash":"{最可能跟哪一類隊友或哪種做法起衝突,一句}","breakup":"{在什麼條件下他會離隊或翻臉,一句}",' +
            '"greet":"{在大廳被搭話時的開場白1~2句,符合性格}",' +
            // 🎨 這欄是給生圖用的，不給玩家看：大廳小人要照這串畫，所以只寫外觀、不寫劇情
            '"sprite":"{這個人的外觀,英文逗號分隔的關鍵詞,只寫看得見的東西:性別/年齡/體型/髮色髮型/瞳色/服裝與配件/隨身物,大約10~16個詞;不要背景、不要姿勢、不要畫風或畫質詞}",' +
            '"quiz":[{"q":"{他用來考驗對方合不合拍的問題或話題}","options":[{"t":"{回應選項}","good":{true或false},"r":"{他對此回應的反應一句}"}]}],' +
            '"accept":"{三題都滿意時的入隊台詞1~2句}","refuse":"{不滿意時的婉拒台詞一句}"}]}\n' +
            // 🚨sprite 的年齡不寫清楚就會吐 age 32 這種數字:生圖模型看不懂數字,只會把它當雜訊,
            //   年紀完全畫不出來(實機回報)。這裡只描述「要什麼性質」,不列年齡層清單——列了四個檔位
            //   模型會拿它當題庫輪流填,四個旅人的年齡就被那份清單決定了。
            '【sprite 的年齡】年齡要寫成生圖模型看得懂的英文年齡說法,不准出現數字、也不准出現 age 這個字。四十歲以上還要再補一個看得見的老化特徵,不然畫出來一律是年輕臉。\n' +
            '每位旅人 quiz 固定 3 題、每題 options 固定 3 個且恰好 1 個 good=true;good 選項不是討好或客套話,而是最對上這個人性格與在意之處的回應,要靠理解他才選得中,錯誤選項也要看起來合理。\n' +
            // 🚨只餵前段:旅人要的是世界長怎樣、社會怎麼運作,用不到正史/核心人物/事件鉤子。
            //   整份塞回去會讓這支的輸入暴增(實測破萬字),輸出額度被擠掉 → JSON 被截斷 → 召集失敗。
            '【世界檔案(節錄)】\n' + _briefWorld(worldText) + '\n' +
            // 規則那條寫著「核心人物不可重複」,但節錄砍在第六節之前,第九節整個沒給它——
            //   看不到名單當然會撞。不必把那節餵回去(輸入暴增會擠掉輸出額度),列出名字就夠了。
            _coreNamesLine(worldText) +
            '語言:繁體中文。';
        // 旅人走副模型:四張身分卡＋考題包是照規格填欄位,不是重活,主模型寫這個又慢又貴。
        // 世界檔案那支仍留給主模型——那份是整個世界的地基,後面所有東西都長在它上面。
        const r = await _callAI(prompt, '世界門召集旅人', 'worldgate_travelers', false, false, true);   // 這支也跑兩百多秒,同樣要串流
        const arr = Array.isArray(r) ? r : (r && Array.isArray(r.travelers) ? r.travelers : []);
        return arr.filter(t => t && t.name);
    }
    // 只抓第九節的人物「名字」給旅人那支避開：整節餵回去會讓輸入暴增（那正是當初砍掉它的原因），
    //   但完全不給,規則寫再多次「不可重複」它也不知道要避開誰。
    function _coreNamesLine(t) {
        const s = _cleanModelOutput(t);
        // 開頭要收 ^:續寫補回來的片段可能就是從某一節的標題開始,前面沒有換行
        const sec = s.match(/(?:^|\n)#+\s*九[、.][\s\S]*?(?=\n#+\s*十[、.]|$)/);
        if (!sec) return '';
        const names = [];
        const push = n => {
            n = String(n || '').replace(/^[\s\-—•]+/, '').trim();
            if (n && n.length <= 16 && names.indexOf(n) < 0) names.push(n);
        };
        let hit;
        // 「**一、瑇瑁公主**」這種粗體序號標題是最常見的寫法
        const re = /\*\*\s*[一二三四五六七八九十]+\s*[、.]\s*([^*\n]{1,16}?)\s*\*\*/g;
        while ((hit = re.exec(sec[0])) && names.length < 6) push(hit[1]);
        if (!names.length) {
            // 沒編號就退一步抓粗體短句；帶冒號的是欄位標籤(**外在形象：**)不是名字
            const re2 = /\*\*\s*([^*\n]{1,16}?)\s*\*\*/g;
            while ((hit = re2.exec(sec[0])) && names.length < 6) { if (!/[：:]/.test(hit[1])) push(hit[1]); }
        }
        return names.length ? '【這個世界的核心人物,旅人不可與他們同名或名字近似】' + names.join('、') + '\n' : '';
    }
    // 旅人只需要前半段(世界總覽/地圖/降生點/社會結構/社會常識)；再長就砍到 1800 字為止
    function _briefWorld(t) {
        let s = _cleanModelOutput(t);
        const cut = s.search(/\n#+\s*六[、.]|\n#+\s*七[、.]|\n#+\s*八[、.]/);
        if (cut > 400) s = s.slice(0, cut);
        return s.length > 1800 ? s.slice(0, 1800) : s;
    }
    function _normTravelers(arr) {
        return (Array.isArray(arr) ? arr : []).slice(0, 4).map(t => ({
            name: String(t.name || '無名旅人'), job: String(t.job || '旅人'),
            persona: String(t.persona || ''), origin: String(t.origin || ''), skill: String(t.skill || ''),
            look: String(t.look || ''), record: String(t.record || ''), reason: String(t.reason || ''),
            fit: String(t.fit || ''), weakness: String(t.weakness || ''), goal: String(t.goal || ''),
            clash: String(t.clash || ''), breakup: String(t.breakup || ''),
            greet: String(t.greet || ''), sprite: String(t.sprite || ''),
            quiz: (Array.isArray(t.quiz) ? t.quiz : []).slice(0, 3).map(q => ({
                q: String((q && q.q) || ''),
                options: (Array.isArray(q && q.options) ? q.options : []).slice(0, 3)
                    .map(o => ({ t: String((o && o.t) || ''), good: !!(o && o.good), r: String((o && o.r) || '') }))
                    .filter(o => o.t),
            })).filter(q => q.q && q.options.length >= 2),
            accept: String(t.accept || ''), refuse: String(t.refuse || ''),
            recruited: false,
        }));
    }

    // ══ 🎴 這個世界的活動面板外觀(VN 劇情末尾那一頁) ══════════════════
    // 跟旅人那支並行:兩支都只吃世界檔案節錄、彼此不相干。
    // 🚨不跟旅人合成一支:旅人是 4 人 × 三題三選項的高結構 JSON,面板是一大坨連續 CSS,
    //   誰排在後面誰被寫壞——結構化輸出擺在長輸出的尾巴是品質最差的位置(旅人當初從世界檔案拆出來就是這條)。
    //   而且風格庫那七八百字的美術指令只有面板用得到,合併等於讓旅人也讀一遍。
    // 🚨輸出不用 JSON:CSS 的引號、大括號與換行包進 JSON 字串太容易讓整份 parse 失敗
    //   (世界檔案當初改收純文字就是這個理由)。改用標籤把要的兩段圈起來,外面包什麼都不必管。
    const _PANEL_RULES =
        '你要做的是一款遊戲的「活動主畫面」:玩家打完一段劇情後看到的那一頁。' +
        '畫面中央會站著這趟同行的人物(那張圖由程式墊在你下面,你看不到、也不必畫),你要做的是疊在它上面的那層介面。\n' +
        '【輸出格式】只輸出下面兩個區塊,兩個都要有、缺一不可,區塊外不要任何說明、開場白或程式碼圍欄:\n' +
        '<panel-html>介面的 HTML</panel-html>\n<panel-css>它的 CSS</panel-css>\n' +
        '【工程規則·不可違反,與底下的美術方向衝突時一律以這裡為準】\n' +
        // 🚨前綴是為了不跟酒館/VN 既有樣式互相蓋。程式端出口還會再前綴一次做保險,但模型自己帶前綴,
        //   萬一有哪條漏掉也不會撞到菜市場名(.card/.btn 那些兩邊都有的)。
        '- 每一個 class 名稱都要以 wgp- 開頭,例如 wgp-rail、wgp-badge。\n' +
        '- 你的面板容器已經是一塊寬高各 100% 的絕對定位區域。元素用 position:absolute 貼到四邊,不要用 position:fixed。\n' +
        // 中央淨空是這個畫面的骨架:人物站中間,UI 沿邊——同 P5 那類啟程畫面的作法
        '- 畫面正中央那一塊(上下左右各往內三成的範圍)是人物區,不可以放任何元素、色塊或半透明遮罩。\n' +
        // 🚨系統鍵原本是固定的金色古典框,擺進任何一個世界的畫面裡都是異物 → 交給模型一起設計外觀。
        //   但文字是鎖死的:換成世界觀說法(離艦/調律/終端)玩家會找不到自己的手機。程式端渲染時會強制寫回。
        '- 畫面右上角是系統按鈕區,那三顆也由你設計外觀,做在右上角(桌機橫排、手機可以沿右緣直排)。\n' +
        '- 不要寫 background-image,也不要給整面鋪底色:底圖在你下面,蓋掉就看不到人物了。\n' +
        '- 不准用 !important。不准連任何外部網址(圖片、字型、CDN 一律不行),要圖案就用 CSS 畫或內嵌 SVG。\n' +
        // 🚨實測最常壞的一項:只給了背景色沒給文字色,文字色就從遊戲那邊繼承一個淺色下來,白底白字整行看不見。
        //   選中態、強調態那幾個最容易中,因為模型只想著「把底翻成亮的」。
        '- 只要給某個元素指定了背景色,就必須同時指定它的文字色,不可以靠繼承。' +
        '包括選中、強調、hover 這些狀態:底色翻亮的時候文字要一起翻深,反過來也一樣。\n' +
        // 🚨底圖是每個世界各自生的,亮暗完全不可預測。半透明卡片等於拿文字去跟一張沒看過的圖對賭。
        '- 有文字的區塊,底色要用實色(不透明度不得低於 0.85)。你下面那張圖每個世界都不一樣、亮暗無法預測,' +
        '半透明卡片會讓圖透上來跟文字對沖。想要通透感就用實色配細邊框或陰影,不要用半透明填色。\n' +
        // 🚨實測它會自己編出章節編號、任務清單、獎勵與貨幣數值。程式沒有那些資料,寫上去就是假的,玩家會當真。
        '- 不可以編造任何遊戲資料。禁止出現:章節編號與章節名、任務或目標清單、獎勵、貨幣、點數、經驗、等級、' +
        '進度條、完成度、日期、時間、統計數字。這些東西程式一項都沒有,你寫出來的都是假的。\n' +
        '  這個畫面只放兩種文字:世界名與那句話、以及底下指定的那幾個入口。其餘一律是裝飾圖形。\n' +
        '  風格上的小標記(代號、序號、細線條、圖示)可以留,但不可以做成看起來像玩家持有的數值、進度或獎勵。\n' +
        '- 不要 script、不要 onclick,互動只能靠 CSS 的 :hover 與 transition。\n' +
        // 🚨這條是實測炸出來的:原本寫「用 @media 調整」，但 @media/vw/vh 量的是整個瀏覽器視窗，
        //   而這塊面板的寬度跟著酒館聊天欄走。視窗很寬、面板很窄時那些規則一條都不會生效，
        //   模型照桌機版型排的東西就整個飛出可視範圍。面板已設 container-type，改用容器查詢才量得準。
        '- 這塊面板沒有固定大小,它的寬度跟著外面的欄位變,可能很寬也可能只有一條。因此:\n' +
        '　尺寸、位置與間距一律用百分比,字級用 clamp() 夾住上下限,不要寫死 px 寬度或 px 位移。\n' +
        '　🚨禁止使用 @media、vw、vh。那三個量的是整個瀏覽器視窗而不是這塊面板,面板變窄時它們不會生效,' +
        '你排的東西會直接飛出可視範圍。要依面板大小調整請用 @container(容器名 vnep)與 cqw、cqh。\n' +
        '　面板很窄時要能收成單欄:元素不可以擠成一團,也不可以有任何東西超出邊界。\n' +
        '【必須有的入口·八個一個都不能少】每一顆都要帶上指定的 data-act;程式靠這個字串綁行為,寫錯或漏掉就點不動。\n' +
        '這一區(畫面左側或下方,你決定)五顆,文案依這個世界的說法重寫:\n' +
        '　data-act="data"(這一章的資料與狀態)\n' +
        '　data-act="ctx"(上下文用量)\n' +
        '　data-act="journal"(日誌)\n' +
        '　data-act="map"(地圖)\n' +
        '　data-act="achv"(這個世界的成就)\n' +
        '右上角系統區三顆,造型隨你,但文字鎖死:\n' +
        '　data-act="phone" 文字必須是「手機」\n' +
        '　data-act="settings" 文字必須是「設定」\n' +
        '　data-act="home" 文字必須是「退出」\n' +
        // 包成 span 是為了讓程式只換文字、不動模型設計的外框與圖示
        '　🚨這三顆是遊戲本身的系統功能,不是這個世界的東西。文字不可以改寫成世界觀的說法,' +
        '換了名字玩家會找不到自己的手機。請把那三個字各自包在 <span data-label></span> 裡。\n' +
        'data-act 的值一律照抄,不要翻譯也不要加字。少一顆玩家就少一個功能,請自己數過再輸出。\n' +
        '另外做一個標題區放世界名與一句話,那一區不要做成可以點的東西。\n' +
        '【文字】介面上的中文一律繁體。不要在介面上寫解釋性的說明文字。\n';
    // 開標籤取最後一個:思考鏈會先把標籤名唸過一遍,取第一個等於把草稿也收進來。
    // 缺結束標籤照樣收到結尾——那正是被截斷的情況,硬要成對就等於整份丟掉。
    function _pickTagged(text, tag) {
        const s = String(text || '');
        const open = new RegExp('<' + tag + '[^>]*>', 'gi');
        let m, at = -1, len = 0;
        while ((m = open.exec(s))) { at = m.index; len = m[0].length; }
        if (at < 0) return '';
        const rest = s.slice(at + len);
        const end = rest.search(new RegExp('</' + tag + '\\s*>', 'i'));
        return (end >= 0 ? rest.slice(0, end) : rest).trim();
    }
    // 🚨規則寫了不等於模型照做。這幾樣漏進來都是全域災難:!important 會蓋到酒館、外連在別人那邊載不到、
    //   script 會直接在面板裡跑。所以規則歸規則,出口再剝一次。
    function _cleanPanelHtml(s) {
        return String(s || '')
            .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
            .replace(/<\/?(?:script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
            .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
            .replace(/\s(?:src|href|xlink:href)\s*=\s*"(?:https?:)?\/\/[^"]*"/gi, '')
            .replace(/\s(?:src|href|xlink:href)\s*=\s*'(?:https?:)?\/\/[^']*'/gi, '')
            .trim();
    }
    function _cleanPanelCss(s) {
        return String(s || '')
            .replace(/@import[^;]*;/gi, '')
            .replace(/url\(\s*['"]?(?:https?:)?\/\/[^)]*\)/gi, 'none')
            .replace(/\s*!\s*important/gi, '')
            .replace(/position\s*:\s*fixed/gi, 'position:absolute')
            .trim();
    }
    // 生成當下把玩家的裝置與實際畫面尺寸一起告訴它:同一份規則在手機上排出來的桌機版面沒法用。
    //   判斷沿用專案既有那套(UA 比對 + 視窗寬度,同 control_center.isMobileDevice)。
    //   hover 另外講:觸控螢幕沒有 hover,狀態回饋只放在 hover 上等於手機玩家看不到。
    function _isMobile() {
        try {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(win.navigator.userAgent)
                || (win.innerWidth || 0) < 768;
        } catch (e) { return false; }
    }
    function _screenLine() {
        const doc = win.document;
        let w = 0, h = 0;
        // 由內而外找:VN 全螢幕層 → VN 容器 → 酒館聊天欄。都拿不到才退回整個視窗。
        ['#page-game', '.vn-container', '#sheld'].some(sel => {
            try {
                const r = doc.querySelector(sel)?.getBoundingClientRect();
                if (r && r.width > 120 && r.height > 120) { w = Math.round(r.width); h = Math.round(r.height); return true; }
            } catch (e) {}
            return false;
        });
        if (!w) { w = Math.round(win.innerWidth || 0); h = Math.round(win.innerHeight || 0); }
        const mobile = _isMobile();
        let s = '【這個玩家用什麼在玩】' + (mobile ? '手機端' : '電腦端');
        if (w && h) {
            const ratio = w / h;
            s += ',面板的實際範圍大約 ' + w + ' × ' + h +
                 '(' + (ratio >= 1.3 ? '橫式' : (ratio <= 0.85 ? '直式' : '接近正方')) + ')';
        }
        s += '。請照這個做版面。\n';
        if (mobile) {
            s += '手機端要注意:收成單欄或沿邊排,不要做成需要橫向掃視的多欄;' +
                 '可以點的東西要夠大(手指不是滑鼠);字不可以小到看不清;元素之間留出間隔,不要擠在一起。\n';
        }
        let hover = true;
        try { hover = !(win.matchMedia && win.matchMedia('(hover: none), (pointer: coarse)').matches); } catch (e) {}
        if (!hover) s += '這是觸控螢幕,沒有 hover——任何看得出狀態的東西都不可以只靠 hover 呈現,平常就要看得出哪些可以點。\n';
        return s;
    }
    async function _expandPanel(seed, worldText) {
        const S = win.OS_UI_STYLE || window.OS_UI_STYLE;
        if (!S || !S.pick) return null;   // 風格庫沒載入=沒有這個功能,世界照樣能玩(末尾退回原本那幾顆鍵)
        // 不限 cssOnly:AVS 只能純 CSS 所以挑得到的包有限,這裡底下墊著一張圖,
        //   那幾包要有主視覺才成立的風格終於用得上——這是風格庫接進 VN 才拿得到的東西。
        const art = S.pick();
        const prompt =
            _PANEL_RULES +
            _screenLine() +
            '【這個世界】' + seed.name + ':' + (seed.concept || '') +
            (seed.genre ? '(題材:' + seed.genre + ')' : '') + (seed.style ? '(風格:' + seed.style + ')' : '') + '\n' +
            '【世界檔案(節錄)】\n' + _briefWorld(worldText) + '\n' +
            S.build(art.styleId, art.layoutId) +
            '語言:繁體中文。';
        const raw = await _callAI(prompt, '世界門生成活動面板', 'worldgate_panel', false, true, true);
        if (!raw) return null;
        const html = _pickTagged(raw, 'panel-html');
        if (!html) { console.warn('[Worldgate③] 面板沒認到 <panel-html>,這個世界先不做面板'); return null; }
        S.remember(art.styleId, art.layoutId);
        return {
            html: _cleanPanelHtml(html), css: _cleanPanelCss(_pickTagged(raw, 'panel-css')),
            styleId: art.styleId, layoutId: art.layoutId,
        };
    }

    // ══ 🏅 這個世界的成就清單 ═══════════════════════════════════════
    // 🚨不另開一套解鎖機制:VN 本來就有 [Achievement|表情|名|描述],每三輪必出一個。
    //   這裡只是「先把這個世界該有哪些成就寫下來」,解鎖照樣走那條既有管道 → 零對撞。
    //   名字對得上清單的就是這個世界的成就,對不上的就是原本那種即興成就,兩邊互不干擾。
    // 真正的用途不是收集要素,是「給主持AI 的方向」:清單寫進世界書條目、每一輪都看得到,
    //   它就會朝那些方向鋪機會。全是戰鬥成就的世界,主持AI 也只會給你戰鬥。
    async function _expandAchv(seed, worldText) {
        const prompt =
            '你是一位跑團設計師。請為以下這個世界設計一份成就清單,玩家在這個世界裡達成後會被記錄下來。\n' +
            // 🚨她做這份清單的原因就是這條:預設情況下每個世界都變成打打殺殺,隊友淪為工具人
            '【最重要的一條】這個世界不是只有戰鬥。一般成就裡最多一條跟戰鬥或危險有關,' +
            '其餘要來自這個世界的日常:謀生、手藝、交易、旅行、見識、吃住、打聽消息、跟當地人打交道。\n' +
            '【情感成就】寫玩家與同行旅人之間會發生的事。他們是各自報名、在大廳湊在一起的陌生人,' +
            '不是玩家的部下——所以這幾條要寫「關係怎麼變化」:從陌生到願意搭話、看見對方不想被看見的一面、' +
            '被拒絕、意見不合之後仍然同行、有人先走。不要寫成好感度數值,也不要預設關係一定會變好。\n' +
            '不要指名特定旅人(隊伍每趟都可能不同),用「同行的人」這種寫法。\n' +
            '【隱藏成就】玩家事先看不到條件的那種。要有點偏門,是玩家做了不尋常的事才會碰到。\n' +
            '只回傳純 JSON:\n' +
            '{"normal":[{"name":"{成就名,2~8字}","desc":"{給玩家看的一句話,不要寫出達成方法}","how":"{怎樣才算達成,一句,寫給主持AI 判斷用}"}],' +
            '"bond":[同樣格式],"hidden":[同樣格式]}\n' +
            'normal 五條、bond 五條、hidden 三條,數量不可增減。\n' +
            '成就名要用這個世界自己的說法,不要用「成就」「達成」「任務」這種字眼。\n' +
            '【世界檔案(節錄)】\n' + _briefWorld(worldText) + '\n' +
            _toneLine(seed) + '語言:繁體中文。';
        const r = await _callAI(prompt, '世界門設計成就', 'worldgate_achv', false, false, true);
        if (!r) return null;
        const pick = (arr, n) => (Array.isArray(arr) ? arr : []).slice(0, n)
            .map(x => ({ name: String((x && x.name) || '').slice(0, 12), desc: String((x && x.desc) || ''), how: String((x && x.how) || '') }))
            .filter(x => x.name);
        const out = { normal: pick(r.normal, 5), bond: pick(r.bond, 5), hidden: pick(r.hidden, 3) };
        if (!out.normal.length && !out.bond.length && !out.hidden.length) return null;
        return out;
    }
    // 清單寫進條目給主持AI 看。隱藏成就照樣給它(它要知道才鋪得出來),玩家那邊才遮。
    // 🚨明講「名字要一字不差」:程式端靠名字比對來標已完成,寫成同義詞就對不上。
    function _achvBlock(w) {
        const a = w.achv;
        if (!a) return '';
        const rows = g => (a[g] || []).map(x => '- ' + x.name + '：' + (x.how || x.desc)).join('\n');
        const parts = [];
        if ((a.normal || []).length) parts.push('### 一般\n' + rows('normal'));
        if ((a.bond || []).length) parts.push('### 與同行者之間\n' + rows('bond'));
        if ((a.hidden || []).length) parts.push('### 隱藏(玩家看不到條件)\n' + rows('hidden'));
        if (!parts.length) return '';
        return '\n\n## 這個世界的成就\n' + parts.join('\n') +
            '\n這是這個世界值得被記下來的事,不是任務清單,玩家不做也沒關係——但機會要鋪得出來:' +
            '別讓這個世界只剩下戰鬥,上面那些日常與關係的事也要有發生的餘地。' +
            '玩家真的達成其中一條時,用既有的成就標記把它記下來,名字必須跟上面一字不差,不可以改寫或換同義詞。';
    }

    // ── 世界條目落地【奧瑞亞-視差】書 ──
    function _entryComment(w) { return '【世界檔案-' + w.name + '】'; }
    // 面板那塊是純文字容器(white-space:pre-wrap),markdown 不會被渲染——**世界名** 的星號就這樣露在臉上。
    // 而且條目開頭那幾行是寫給主持AI的題材規範,玩家看了沒意義,還先吃掉一半篇幅,截到 600 字還沒進正題。
    // 所以先砍頁首、再把記號剝乾淨,剩下的篇幅才都是世界本身。
    function _plainPreview(t, n) {
        const s = String(t == null ? '' : t)
            .replace(/^#\s*視差世界檔案[\s\S]*?\n\n/, '')     // 給主持AI的頁首(舊世界的條目才有)
            .replace(/^\s*#{1,6}\s*/gm, '')                   // 標題記號
            .replace(/\*\*([^*]+)\*\*/g, '$1')                // 粗體
            .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')        // 斜體
            .replace(/^\s*[-–—•]\s+/gm, '・')                  // 條列符號
            .replace(/[ \t]+$/gm, '')
            .replace(/\n{3,}/g, '\n\n').trim();
        return s.length > n ? s.slice(0, n) + '…' : s;
    }
    // 面板上方已經有世界名、一句話概念與風格標籤,預覽再抄一遍沒意義;整份世界檔案本來就會進世界書,
    // 玩家在這裡要知道的只有「這個世界的規矩是什麼」,不是先被劇透一輪。所以只取核心法則那一段。
    function _corePreview(t) {
        const s = _plainPreview(t, 1e6);
        const i = s.search(/核心法則/);
        if (i < 0) return _plainPreview(t, 220);
        // 標題行(核心法則——某某:)有時自己就帶內容、有時內容在下一段,兩種都要收
        const seg = (s.slice(i).replace(/^核心法則[^\n:：]*[:：]?[ \t]*/, '').replace(/^\n+/, '')
            .split(/\n\s*\n/).filter(x => x.trim())[0] || '').trim();
        if (!seg) return _plainPreview(t, 220);
        return seg.length > 220 ? seg.slice(0, 220) + '…' : seg;
    }
    // ── 🎭 旅人的視差外觀（sprite 欄）回傳給酒館 ──
    //   sprite 是召集旅人時就產好的英文外觀關鍵詞(髮色髮型/瞳色/年齡體型/服裝配件)，本來只餵給大廳小人生圖，
    //   主持AI 完全收不到 → 每次進世界都自己重新編一個人，同一個旅人在大廳跟在 VN 裡長得不是同一張臉。
    //   兩層寫清楚：不變的是「這個人」(髮色髮型/瞳色/年齡/體型)，會變的是種族形態(指令0的身體改造)與服裝(本世界的民族/職業)。
    function _lookBlock(list) {
        const look = (list || []).filter(t => t && t.sprite)
            .map(t => '- ' + t.name + ':' + t.sprite).join('\n');
        if (!look) return '';
        return '\n\n## 旅人的視差原樣(外觀基準)\n' + look + '\n' +
            '這是他們在視差系統(純白大廳)的本人樣貌,是跨世界固定的。描寫他們、或輸出 [Avatar] 那行時:\n' +
            '- 髮色髮型、瞳色、年齡檔、體型必須照這串,不可另編一個人。\n' +
            '- 種族形態寫他們被這個世界的法則改造之後的樣子(不是原本的人類身體)。\n' +
            '- 服裝依這個世界的民族與職業改寫,不必照抄視差那套便服。';
    }
    // 🚨玩家指定的身分一定要寫進條目:開場指令只是一則聊天訊息,聊個幾輪就被擠出上下文,
    //   主持AI 就會慢慢把玩家寫回它自己想的那個版本。條目是常駐的,每一輪都看得到。
    function _pcBlock(w) {
        const s = String(w.pc || '').trim();
        if (!s) return '';
        return '\n\n## 玩家在這個世界的身分(玩家指定,不可更動)\n' + s + '\n' +
            '描寫玩家、或輸出 [Avatar] 那行時一律照這個寫:種族形態、能力路線與外觀都不可以換成別的版本。' +
            '與這個世界的法則看起來衝突時,用這個世界自己的說法讓它成立,不要改掉它。';
    }
    function _entryContent(w, entryText) {
        // 🚨只寫「真的入隊」的旅人：條目是持久的、隊伍是每趟都可能不同的,兩者本來就不同層。
        //   寫進全部候選的話,玩家單人進去時主持AI仍收到四份旅人檔案→沒招募的人自己走進劇情;
        //   留在大廳的人的弱點/翻臉條件也等於白白劇透。隊伍在按下 DIVE 那刻定案(之後就清場),
        //   所以 _dive 會在注入開場指令前重寫一次條目。
        // 旅人區塊帶上目標/弱點/翻臉條件——這是給主持AI看的底牌,玩家在身分卡上看不到這幾欄
        const recruited = (w.travelers || []).filter(t => t && t.recruited);
        const trav = recruited
            .map(t => '- ' + t.name + '(' + t.job + '):' + t.persona + ' ' + t.origin +
            (t.skill ? ';擅長' + t.skill : '') + (t.fit ? ';與這個世界的關係:' + t.fit : '') +
            (t.goal ? ';個人目標:' + t.goal : '') + (t.weakness ? ';弱點:' + t.weakness : '') +
            (t.clash ? ';容易起衝突於:' + t.clash : '') + (t.breakup ? ';離隊或翻臉的條件:' + t.breakup : '')).join('\n');
        return '# 視差世界檔案:' + w.name + '\n' +
            '一句話:' + w.concept + '(' + (w.genre ? '題材:' + w.genre + ' ' : '') + '風格:' + w.style + ')\n' +
            (w.genre ? '本世界的一切描寫都必須維持在「' + w.genre + '」的題材裡,不得混入不屬於此題材的科技或現代說法。\n' : '') +
            (w.twist ? '核心法則:' + w.twist + '\n' : '') + '\n' + entryText +
            (trav ? '\n\n## 這趟同行的旅人(視差玩家,非本世界NPC)\n' + trav : '') +
            _lookBlock(recruited) + _pcBlock(w) + _achvBlock(w);
    }
    async function _writeEntry(w, entryText) {
        const TH = _th();
        if (!TH || !TH.getLorebookEntries) return false;
        try {
            const entryData = {
                comment: _entryComment(w),
                keys: (w.keys && w.keys.length ? w.keys : [w.name]),
                content: _entryContent(w, entryText),
                enabled: true,
                position: 'before_char_defs',
                order: 95,
            };
            const entries = await TH.getLorebookEntries(BOOK_PARA);
            const exist = (entries || []).find(e => e.comment === entryData.comment);
            if (exist) {
                await TH.updateLorebookEntriesWith(BOOK_PARA, list =>
                    list.map(e => e.comment === entryData.comment ? { ...e, ...entryData } : e));
            } else {
                await TH.createLorebookEntries(BOOK_PARA, [entryData]);
            }
            return true;
        } catch (e) { console.error('[Worldgate③] 世界條目寫入失敗', e); return false; }
    }
    // ── 🩺 體檢：檔案庫（OS_DB）與酒館世界書兩邊的狀態對不對得上 ──
    //   會歪的三種：①整本書被刪或沒匯入 ②某個世界的條目被手動刪掉 ③書在但沒掛到這張角色卡。
    //   ①②自己補得回來（世界檔案原文留在檔案庫裡，重建不必再燒 API）；
    //   ③只提示不自動修——大廳在別人的卡裡也開得起來，自動掛載等於把視差世界書塞進別人的角色卡。
    //   新舊兩版助手的函式名不同，這裡各包一層。
    function _th2() { const T = _th(); return T || {}; }
    async function _bookExists() {
        const T = _th2();
        try {
            if (typeof T.getWorldbookNames === 'function') return (T.getWorldbookNames() || []).includes(BOOK_PARA);
            if (typeof T.getLorebooks === 'function') return (T.getLorebooks() || []).includes(BOOK_PARA);
        } catch (e) {}
        return true;   // 問不到就當它在，不要嚇人
    }
    async function _createBook() {
        const T = _th2();
        try {
            if (typeof T.createWorldbook === 'function') return !!(await T.createWorldbook(BOOK_PARA));
            if (typeof T.createLorebook === 'function') return !!(await T.createLorebook(BOOK_PARA));
        } catch (e) { console.warn('[Worldgate③] 建立世界書失敗', e); }
        return false;
    }
    function _charBooks() {
        const T = _th2();
        try {
            if (typeof T.getCharWorldbookNames === 'function') return T.getCharWorldbookNames('current') || {};
            if (typeof T.getCharLorebooks === 'function') return T.getCharLorebooks({ type: 'all' }) || {};
        } catch (e) {}
        return null;   // 問不到（例如沒開角色卡）→ 不判定、不提示
    }
    async function _linkBook() {
        const T = _th2();
        const cur = _charBooks();
        if (!cur) return false;
        const add = (cur.additional || []).slice();
        if (!add.includes(BOOK_PARA)) add.push(BOOK_PARA);
        const next = { primary: cur.primary || null, additional: add };
        try {
            if (typeof T.rebindCharWorldbooks === 'function') { await T.rebindCharWorldbooks('current', next); return true; }
            if (typeof T.setCurrentCharLorebooks === 'function') { await T.setCurrentCharLorebooks(next); return true; }
        } catch (e) { console.warn('[Worldgate③] 掛載世界書失敗', e); }
        return false;
    }
    // 回傳 { fixed:補回幾個條目, linked:有沒有掛在這張卡上(null=判斷不了) }
    async function _healthCheck() {
        const T = _th2();
        const worlds = await _get(K_WORLDS, []);
        if (!worlds.length) return { fixed: 0, linked: null };
        if (!(await _bookExists())) await _createBook();
        let fixed = 0;
        try {
            const entries = (T.getLorebookEntries ? await T.getLorebookEntries(BOOK_PARA) : []) || [];
            const have = new Set(entries.map(e => e && e.comment));
            for (const w of worlds) {
                if (have.has(_entryComment(w))) continue;
                if (!w.entryText) continue;   // 沒有原文就補不回來（很舊的世界）
                if (await _writeEntry(w, w.entryText)) fixed++;
            }
        } catch (e) { console.warn('[Worldgate③] 體檢補條目失敗', e); }
        const cb = _charBooks();
        const linked = cb ? ((cb.primary === BOOK_PARA) || (cb.additional || []).includes(BOOK_PARA)) : null;
        return { fixed, linked };
    }

    // 🚨世界條目的燈由程式管，不要靠關鍵字觸發，也不要靠人記得開關：
    //   ① 條目的關鍵字是世界名與專有名詞，觸發來源其實是 DIVE 那則開場指令（第 0 樓）。
    //      每二十輪總結後舊樓被隱藏、連第 0 樓一起隱藏 → 關鍵字整個消失 → 世界書從此不載入，AI 開始忘記這個世界。
    //   ② 手動改成藍燈(常駐)可以解決①，但換世界時忘記關掉上一個 → 同時吃到兩個世界的設定。
    //   所以：只有「現在人在的那個世界」是常駐，其餘視差世界一律關閉，切換與撤離時自動同步。
    //   常駐欄位在不同版本的助手是三種寫法（strategy.type / constant / type），三個都寫，讀哪個都對。
    async function _syncWorldLamps(activeId) {
        const TH = _th();
        if (!TH || !TH.updateLorebookEntriesWith) return;
        try {
            const worlds = await _get(K_WORLDS, []);
            const owned = {};
            worlds.forEach(w => { owned[_entryComment(w)] = w.id; });
            // 已經是對的就不要寫：這支會被開窗時順手叫到，每次都寫一遍世界書沒必要
            const cur = (TH.getLorebookEntries ? await TH.getLorebookEntries(BOOK_PARA) : null) || [];
            const isOn = e => (e.constant === true) || (e.type === 'constant') ||
                (e.strategy && e.strategy.type === 'constant');
            const dirty = cur.some(e => {
                const wid = owned[e && e.comment];
                if (!wid) return false;
                const on = !!activeId && wid === activeId;
                return isOn(e) !== on || (e.enabled !== false) !== on;
            });
            if (!dirty) return;
            await TH.updateLorebookEntriesWith(BOOK_PARA, list => (list || []).map(e => {
                const wid = owned[e && e.comment];
                if (!wid) return e;   // 不是世界門建的條目（別人放在同一本書裡的東西）→ 一律不碰
                const on = !!activeId && wid === activeId;
                return Object.assign({}, e, {
                    enabled: on,
                    constant: on,
                    type: on ? 'constant' : 'selective',
                    strategy: Object.assign({}, e.strategy || {}, { type: on ? 'constant' : 'selective' }),
                });
            }));
            console.log('[Worldgate③] 世界條目燈號已同步，常駐：' + (activeId || '（無，全部關閉）'));
        } catch (e) { console.warn('[Worldgate③] 同步世界條目燈號失敗', e); }
    }
    async function _deleteEntry(w) {
        const TH = _th();
        if (!TH || !TH.updateLorebookEntriesWith) return;
        try { await TH.updateLorebookEntriesWith(BOOK_PARA, list => list.filter(e => e.comment !== _entryComment(w))); }
        catch (e) { console.warn('[Worldgate③] 世界條目刪除失敗', e); }
    }
    // 刪除的完整動作:世界書條目、檔案庫、大廳上的旅人、旅人對話歷史。
    // 詳情頁的單張刪除與檔案庫的批次刪除共用這條,免得兩邊各寫一份、日後漏掉其中一項。
    async function _deleteWorlds(list) {
        if (!list.length) return;
        for (const w of list) await _deleteEntry(w);   // 世界書是同一份檔案,一個個改不併發
        const ids = new Set(list.map(w => w.id));
        const worlds = await _get(K_WORLDS, []);
        await _set(K_WORLDS, worlds.filter(x => !ids.has(x.id)));
        // 這個聊天室記著「現在屬於哪個世界」,刪掉的正好是它就要一起清,
        // 不然 WORLD_RULES 會照著一個已經不存在的 id 去翻模組條目。
        try {
            if (ids.has(await _getCurrentId())) { await _setCurrentId(''); await _syncWorldLamps(''); }
        } catch (e) {}
        _clearTravelers(); _closeMeet();
        try {   // 旅人對話歷史一起清,不留孤兒
            ids.forEach(id => {
                for (let i = 0; i < MAX_TRAVELER_SPAWN; i++) win.localStorage.removeItem('lstage_hist_wg_' + id + '_' + i);
            });
        } catch (e) {}
    }

    // ── 旅人像素小人(大廳限定;LobbyStage._b 缺席=優雅跳過) ──
    // 「同一個伺服器」感:展開世界/點開世界=旅人自動陸續上線大廳,不用按鈕召喚(Rae 定案 2026-07-22)
    let _travNpcs = [];
    let _travWorldId = null;
    let _travGen = 0;   // 世代閂:清場後殘留的錯峰 setTimeout 不准再刷人
    function _stage() { const LS = win.LobbyStage || window.LobbyStage; return (LS && LS._b) ? LS._b : null; }
    function _clearTravelers() {
        _travGen++;
        _travWorldId = null;
        const b = _stage();
        _travNpcs.forEach(n => {
            try {
                n.el?.remove(); n.tag?.remove(); n.hint?.remove();
                if (b) { const i = b.S.npcs.indexOf(n); if (i >= 0) b.S.npcs.splice(i, 1); }
            } catch (e) {}
        });
        _travNpcs = [];
    }
    function _travelerPersona(t, worldName) {
        return '你現在扮演「' + t.name + '」——視差純白大廳裡等待組隊的玩家旅人(來自奧瑞亞的普通人,不是NPC)。' +
            '定位:' + t.job + '。性格:' + t.persona + '。來歷:' + t.origin + '。擅長:' + t.skill + '。' +
            '你正打算前往世界「' + worldName + '」,在大廳物色隊友;聊得投機可以表達願意同行。輕鬆對話為主,不推進正式劇情。';
    }
    function _spawnTravelers(w) {
        const b = _stage();
        if (!b || b.S.scene !== 'hall') return false;
        if (_travWorldId === w.id && _travNpcs.some(n => b.S.npcs.indexOf(n) >= 0)) return true;   // 同世界且人還活著(勾隊友重渲染別閃人;換過場景回來=物件已死→重新上線)
        _clearTravelers();
        _travWorldId = w.id;
        const alice = b.S.npcs.find(n => n.key === 'alice');
        const ax = alice ? alice.x : 1000, ay = alice ? alice.y : 400;
        const Z = { x: Math.max(60, ax - 620), y: ay + 150, w: 640, h: 280 };   // 愛麗絲前方偏左的開闊區,rollSpot 會避開家具
        const taken = [];
        const rollSpot = () => {
            let best = null, bestScore = -1;
            for (let t = 0; t < 24; t++) {
                const x = Z.x + Math.random() * Z.w, y = Z.y + Math.random() * Z.h;
                try { if (b.blocked && b.blocked(x, y)) continue; } catch (e) {}
                let score = 0.5;
                try { if (b.whiteRatio) score = b.whiteRatio(x, y, 70); } catch (e) {}
                if (taken.some(p => Math.hypot(p.x - x, p.y - y) < 120)) score -= 0.5;
                if (score > bestScore) { bestScore = score; best = { x, y }; }
            }
            const p = best || { x: Z.x + Z.w / 2, y: Z.y + Z.h / 2 };
            taken.push(p);
            return p;
        };
        const gen = _travGen;
        (w.travelers || []).slice(0, MAX_TRAVELER_SPAWN).forEach((t, i) => {
            const sp = rollSpot();   // 站位先佔好(彼此保持距離),上線時間錯開=玩家陸續登入的感覺
            setTimeout(() => {
                if (gen !== _travGen) return;   // 期間清過場(換世界/DIVE/關窗)就別再冒出來
                const b2 = _stage();
                if (!b2 || b2.S.scene !== 'hall') return;
                const npc = b2.addNpc({
                    key: 'wg_' + w.id + '_' + i, name: t.name,
                    personaFull: _travelerPersona(t, w.name),
                    subTitle: '旅人・' + t.job,
                    x: sp.x, y: sp.y,
                    src: (i % 2 === 0) ? b2.ASSET.mcM : b2.ASSET.mcF,
                    noWander: true, avoidBlocks: true, homeRect: Z,
                    // 點旅人=進正常對話模式(開場白=預設對話,打字即自由聊)+右側浮組隊卡(同愛麗絲/瀅瀅成例)
                    onInteract: (n) => {
                        const b3 = _stage(); if (!b3) return;
                        try {
                            const LS = win.LobbyStage;
                            if (t.greet && !(LS.getNpcHistory(n.key) || []).length) LS.pushNpcHistory(n.key, { role: 'assistant', content: t.greet });   // 開場白seed成他的第一句(只seed一次,之後接自由聊記憶)
                        } catch (e) {}
                        b3.startTalk(n);
                        _openEncounter(w.id, i, n);
                    },
                    onProfile: (n) => _openEncProfile(w.id, i, n),    // 右鍵=身分卡(lobby_dress 選單動態項;開在組隊卡的身分卡頁)
                });
                _travNpcs.push(npc);
            }, 350 + i * 750);
        });
        _autofillSprites(w, gen);
        return true;
    }

    // ── 🎨 旅人立姿自動補圖：不用一個一個右鍵進裝扮室，四個剪影會自己陸續換成本人 ──
    //   走裝扮室同一條管線(LobbyDress.genSpriteInto)：生圖→去背像素化→存 skins。
    //   存進 skins 之後就是永久的——下次再進大廳 addNpc 會自己套用，不會重生、不再燒圖。
    //   逐一排隊生(不並發)：同時打四張圖 ComfyUI 會塞車，而且錯開換裝比較像人陸續到齊。
    const SPRITE_PACK_LS = 'wg_sprite_pack_v1';   // {src, key}；沒設=不自動生，維持剪影
    function _spritePackCfg() {
        try { const o = JSON.parse(win.localStorage.getItem(SPRITE_PACK_LS) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    // 舊世界的 sprite 欄可能還帶著「age 32」這種數字(規格是後來才收緊的)。
    //   生圖模型看不懂數字,留著只是雜訊,送出去之前洗掉——不必要求她重新召集旅人。
    // 舊世界的 sprite 欄可能還帶著數字年齡(age 32 / 27 years old)——規格是後來才收緊的。
    //   生圖模型看不懂數字,留著只是雜訊,送出去之前洗掉,不必要求重新召集旅人。
    //   清完照逗號重組:直接 replace 會留下「male , tall」「man, .,」這種毛邊。
    function _cleanSpriteAge(p) {
        const s = String(p || "")
            .replace(/\bage[d]?\s*[:：]?\s*\d+/gi, "")
            .replace(/\b\d+\s*(?:years?\s*old|y\.?o\.?|yrs?)/gi, "")
            .replace(/\d+\s*歲/g, "");
        return s.split(",").map(x => x.trim())
            .filter(x => x && /[a-z0-9\u4e00-\u9fff]/i.test(x))
            .join(", ");
    }
    async function _autofillSprites(w, gen) {
        const cfg = _spritePackCfg();
        if (!cfg.key) return;                                  // 沒在設置頁挑畫風包＝這功能沒開
        const LD = win.LobbyDress || window.LobbyDress;
        if (!LD || !LD.genSpriteInto) return;                  // 舊版 lobby_dress＝優雅跳過
        const list = (w.travelers || []).slice(0, MAX_TRAVELER_SPAWN);
        for (let i = 0; i < list.length; i++) {
            if (gen !== _travGen) return;                      // 換世界/DIVE/關窗＝立刻停手，別再燒圖
            const t = list[i];
            if (!t || !t.sprite) continue;                     // 舊世界沒有 sprite 欄位→跳過(重新召集旅人就會有)
            const key = 'wg_' + w.id + '_' + i;
            const b = _stage();
            if (!b) return;
            try { if (b.skins && b.skins()[key]) continue; } catch (e) {}   // 生過就不再生
            const preset = (LD.listPresets(cfg.src) || []).find(p => LD.presetKeyOf(p) === cfg.key);
            if (!preset) return;                               // 包被刪或改名→整批停手，不要拿錯包亂生
            try {
                const ok = await LD.genSpriteInto(key, _cleanSpriteAge(t.sprite), { src: cfg.src, preset: preset });
                // 🚨換裝要等生成回來才找小人：旅人是錯峰上線的(最晚 2.6 秒)，開跑當下第一位還沒站上場。
                //   期間若換世界/DIVE/關窗就別再動場上的人(皮膚已存好，下次進大廳照樣是本人)。
                if (ok && gen === _travGen) {
                    const b2 = _stage();
                    const npc = _travNpcs.find(n => n && n.key === key);
                    if (b2 && npc) b2.applySkin(npc, key);
                }
            } catch (e) { console.warn('[Worldgate] 旅人立姿生成失敗', t.name, e); }
        }
    }

    // ── 🤝 組隊卡(零API:考題/台詞在展開世界時已生成好;身分卡=卡內第二層頁,不疊modal) ──
    let _meetEl = null, _lobbyRegDone = false, _meetRO = null;
    function _closeMeet() {
        try { _meetRO?.disconnect(); } catch (e) {}
        _meetRO = null;
        try { win.document.querySelector('.lobby-left')?.classList.remove('wg-host-on', 'wg-host-chat'); } catch (e) {}
        _meetEl?.remove(); _meetEl = null;
    }
    function _lobbyReg() {   // 進大廳小窗互斥圈(開裝扮室等其他窗時自動被收掉)
        if (_lobbyRegDone) return;
        const b = _stage();
        if (b && b.regWin) { b.regWin(_closeMeet); _lobbyRegDone = true; }
    }
    async function _saveWorld(w) {
        const worlds = await _get(K_WORLDS, []);
        const i = worlds.findIndex(x => x.id === w.id);
        if (i >= 0) { worlds[i] = w; await _set(K_WORLDS, worlds); }
    }
    // ── 世界的兩張圖:概念圖(一幅遠景)＋方位圖(俯瞰全境,墊在降生地九宮格底下) ──
    // 學 map 面板大地圖那條:AI 只在展開世界那一次順便吐內容關鍵詞,不另外呼叫文字模型;
    // 風格底詞由程式端補,再走背景桶生圖。生不出來就當沒有,面板照常顯示。
    // 🚨方位圖上面要疊九宮格,所以底詞得壓掉文字標籤跟裝飾邊框,不然格子會蓋在字上面。
    // 🚨這三組尺寸會蓋掉圖片設置裡的預設值,所以要自己顧好兩件事:
    //   ①別跌破模型原生解析度(約 100 萬像素),不然出來就是糊的,高清修復補不回來。
    //   ②NAI 免 Anlas 的上限是 1,048,576 像素、寬高必須是 64 的倍數。引擎那邊有防呆會等比縮回,
    //     但縮完比例就跑掉(滿版底圖會被裁),所以不要去踩那條線。ComfyUI 沒有這個限制,同一組值兩邊通用。
    const _ART_W = 1344, _ART_H = 768;    // 概念圖:遠景橫幅,103.2 萬像素
    const _MAP_W = 1024, _MAP_H = 1024;   // 方位圖:正方,104.9 萬像素(剛好貼齊上限)
    // ── 🖼 沒有圖片 API／生圖失敗時的預備圖（六種題材各一組概念圖＋俯視圖）──
    //   放在素材 repo：本 repo 已經超過 jsdelivr 上限，圖不能進來。
    // 🚨題材由程式端從 genre 對關鍵字，不要求模型多輸出一行 TAG：
    //   世界檔案那支的四行程式資料整組被省略過(標籤全禿、一張圖都沒生)，能不加就不加。
    const _FB_BASE = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/worldgate/';
    // 先比對最具體的：星際要排在科幻之前，恐怖排在題材之前（恐怖可以配任何背景，但畫面最好認）
    const _FB_TAGS = [
        ['space', /星際|太空|宇宙|星艦|星艦|銀河|外星|行星/],
        ['horror', /恐怖|驚悚|靈異|克蘇魯|喪屍|詭譚|鬼|邪祟|生存恐懼/],
        ['wuxia', /武俠|仙俠|修仙|江湖|武林|玄幻|東方|古風|門派/],
        ['western_fantasy', /西幻|奇幻|魔法|劍與魔法|中世紀|龍|精靈|矮人|騎士/],
        ['future', /未來|近未來|科幻|賽博|cyber|機械|義體|廢土/i],
        ['modern', /現代|都市|校園|日常|職場|當代/],
    ];
    function _fbTag(w) {
        const s = [w && w.genre, w && w.style, w && w.concept].filter(Boolean).join(' ');
        const hit = _FB_TAGS.find(([, re]) => re.test(s));
        return hit ? hit[0] : 'modern';   // 認不出來就用現代（阿洛那份說明書指定的預設）
    }
    function _fbUrl(w, kind) { return _FB_BASE + _fbTag(w) + '-' + (kind === 'map' ? 'topdown' : 'concept') + '.webp'; }
    const _ART_BASE = 'wide establishing shot, sweeping vista of the whole land, atmospheric lighting, painted concept art, highly detailed environment, no people, no text, no watermark';
    const _MAP_BASE = 'top-down aerial view, painted overhead map, whole territory in one frame, regions separated by terrain, soft muted colours, no labels, no text, no people, no border decoration';
    async function _genArt(prompt, base, w, h) {
        const IM = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
        if (!IM || typeof IM.generateBackgroundAsync !== 'function') return '';
        const p = String(prompt || '').trim();
        if (!p) return '';
        const o = { width: w, height: h };
        // 只借負向詞,不借 VN 的背景底詞:那份是給劇情場景用的,套上來會把世界圖拉成同一種畫風
        try { const d = win.VN_Config && win.VN_Config.data; if (d && d.bgNegPrompt) o.negativePrompt = d.bgNegPrompt; } catch (e) {}
        let url = '';
        try { url = await IM.generateBackgroundAsync(base + ', ' + p, o) || ''; }
        catch (e) { console.warn('[Worldgate③] 生圖失敗', e && e.message); return ''; }
        // blob: 重載就失效 → 轉成 data URL 才存得進檔案庫
        if (url.indexOf('blob:') === 0) {
            try {
                const blob = await (await fetch(url)).blob();
                url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => r(''); fr.readAsDataURL(blob); });
            } catch (e) {}   // 轉檔失敗就留著 blob:這次還看得到,重開才沒有
        }
        return url;
    }
    // 🐣 早鳥:兩張圖的關鍵詞寫在正文之前,串流一吐出來就開生,不必等整篇寫完(正文本身要跑兩百多秒)。
    //   只有走連接 profile 的人真的會串流;其他路徑 onChunk 不觸發 → _early 一直是空的,_fillArt 照舊自己生。
    let _early = null;
    function _earlyStart() { _early = { artPrompt: '', mapPrompt: '', art: null, mapArt: null }; }
    function _earlyScan(acc) {
        if (!_early || _early.done || !acc) return;
        const text = String(acc);
        // 🚨一定要等那行「換行了」才動手:串流是一塊一塊來的,半句關鍵詞生出來的是另一張圖,而且生了就收不回來
        //   → 切掉最後一段(它可能只寫到一半),只認已經換行的那幾行。
        //   標籤同樣不可靠(模型會把行首「概念圖:」當標題省掉),認不到標籤就照長相與順序認:
        //   規定它們是最前面兩行,所以第一條英文關鍵詞行=概念圖、第二條=方位圖。
        const _done = text.split('\n');
        _done.pop();
        const _arts = _done.slice(0, 6).filter(_isArtLine);
        if (!_early.artPrompt) {
            const m = text.match(/概念圖[:：]\s*([^\n]+)\n/);
            const v = m ? m[1].trim() : (_arts[0] || '');
            if (v) {
                _early.artPrompt = v.slice(0, 400);
                _early.art = _genArt(_early.artPrompt, _ART_BASE, _ART_W, _ART_H).catch(() => '');
                console.log('[Worldgate③] 🐣 概念圖早鳥:正文還在寫,圖先開生');
            }
        }
        if (!_early.mapPrompt) {
            const m = text.match(/方位圖[:：]\s*([^\n]+)\n/);
            const v2 = m ? m[1].trim() : (_arts[1] || '');
            if (v2) {
                _early.mapPrompt = v2.slice(0, 400);
                // 🚨接在概念圖後面跑,不併發:生圖那端是排隊處理的,兩張同時送會有一張被丟掉
                const prev = _early.art || Promise.resolve('');
                _early.mapArt = prev.then(() => _genArt(_early.mapPrompt, _MAP_BASE, _MAP_W, _MAP_H)).catch(() => '');
            }
        }
        // 那兩行規定寫在正文最前面,掃過開頭幾千字還沒有就是模型沒照做——收工,
        // 不要之後每來一塊都對著整篇正文重跑正則(七千 token 的文章會掃上百次)。
        if (_early.artPrompt && _early.mapPrompt) _early.done = true;
        else if (text.length > 4000) { _early.done = true; console.warn('[Worldgate③] 🐣 早鳥沒等到生圖關鍵詞,退回寫完再生'); }
    }
    // 🩹 舊世界補救:模型省略行首標籤那幾份,四行程式資料當初整組沒被認出來,
    //   但它們原封不動留在正文開頭與結尾 → 用現在這套容錯重新解析一次,補回欄位、把正文清乾淨,
    //   不必為了修資料重燒一次主模型(一份世界檔案要跑八分鐘)。
    //   只認「正文開頭真的有光禿禿英文關鍵詞行」的那種,其餘世界一律不動,免得誤傷。
    async function _salvageWorld(w) {
        if (!w || !w.entryText || w.artPrompt) return false;
        const r = _parseProgramLines(w.entryText);
        if (!r.artPrompt) return false;
        w.artPrompt = r.artPrompt;
        if (!w.mapPrompt && r.mapPrompt) w.mapPrompt = r.mapPrompt;
        if ((!w.spawns || !w.spawns.length) && r.spawns.length) w.spawns = r.spawns;
        if (r.keys.length && (!w.keys || w.keys.length <= 1)) {
            w.keys = [w.name].concat(r.keys.filter(k => k !== w.name)).slice(0, 5);
        }
        w.entryText = r.text;
        await _saveWorld(w);
        try { await _writeEntry(w, r.text); } catch (e) {}   // 世界書條目跟著更新,免得正文裡那四行被主持AI念出來
        console.log('[Worldgate③] 🩹 舊世界補救:重新解析出程式資料', w.name);
        return true;
    }
    // 在背景補圖,不擋玩家:世界檔案已經等了好幾分鐘,不能再為了兩張圖把畫面卡住。
    // 生完寫回檔案庫;玩家若還停在這個世界的頁面就順手重繪(同隊伍區的做法)。
    // 🚨一張一張生,不要 Promise.all:生圖那端是排隊處理的,兩張同時送會有一張被丟掉
    //   (實測方位圖出得來、概念圖沒有)。map 面板的世界大地圖也是照順序一張張生的。
    async function _fillArt(w) {
        // 目前掛著的如果是預備圖,就當作還沒填——哪天她接上圖片 API,下一次補圖會換成真的
        if (!w || (w.art && w.mapArt && !w.artFb && !w.mapFb)) return;
        let got = false;
        // 早鳥的成果只在「關鍵詞一模一樣」時才認:同一趟展開才對得上,續寫/重抽拿到的是別的世界
        const early = _early || {};
        if (!w.art && w.artPrompt) {
            if (early.art && early.artPrompt !== w.artPrompt) console.warn('[Worldgate③] 🐣 早鳥的關鍵詞跟最終解析出來的對不上,那張圖不採用', early.artPrompt, '≠', w.artPrompt);
            let art = (early.art && early.artPrompt === w.artPrompt) ? await early.art : '';
            if (art) console.log('[Worldgate③] 🐣 概念圖早鳥接手成功,不必再等');
            else art = await _genArt(w.artPrompt, _ART_BASE, _ART_W, _ART_H);   // 沒早鳥或早鳥失敗→照原本的路生一次
            if (art) { w.art = art; got = true; } else console.warn('[Worldgate③] 概念圖沒生出來');
        }
        if (!w.mapArt && w.mapPrompt) {
            let mapArt = (early.mapArt && early.mapPrompt === w.mapPrompt) ? await early.mapArt : '';
            if (!mapArt) mapArt = await _genArt(w.mapPrompt, _MAP_BASE, _MAP_W, _MAP_H);
            if (mapArt) { w.mapArt = mapArt; got = true; } else console.warn('[Worldgate③] 方位圖沒生出來');
        }
        _early = null;   // 這一趟用完就丟,別讓上一個世界的圖被下一個世界接走
        // 🖼 到這裡還是沒有圖(沒接圖片 API、生圖失敗、或模型連關鍵詞都沒吐)→ 掛上這個題材的預備圖。
        //   標記起來:那不是這個世界真正的樣子,以後補得到真圖就換掉。
        if (!w.art) { w.art = _fbUrl(w, 'art'); w.artFb = true; got = true; }
        if (!w.mapArt) { w.mapArt = _fbUrl(w, 'map'); w.mapFb = true; got = true; }
        if (w.art && !w.artFb) delete w.artFb;
        if (w.mapArt && !w.mapFb) delete w.mapFb;
        if (!got) return;
        await _saveWorld(w);
        if (_winEl && _curDetailId === w.id) { try { _renderDetail(w); } catch (e) {} }
    }
    function _profRows(t) {
        const row = (k, v) => v ? '<div class="wg-prof-row"><span>' + k + '</span><b>' + _esc(v) + '</b></div>' : '';
        return row('定位', t.job) + row('外貌', t.look) + row('性格', t.persona) +
            row('來歷', t.origin) + row('資歷', t.record) + row('擅長', t.skill) + row('動機', t.reason) +
            row('目標', t.goal) + row('對這個世界', t.fit) + row('弱點', t.weakness);
    }
    function _openEncProfile(worldId, ti, npc) { _openEncounter(worldId, ti, npc, true); }   // 右鍵=直接開在身分卡頁
    // 考題的「他說的話」直接打進底部對話框(對話感);純顯示、不進 lstage_hist——
    // 他的一對一記憶只有:開場白seed+自由聊天+入隊宣言,考題過程不污染
    function _sayInDialog(text) {
        try { const el = win.document.getElementById('iris-text'); if (el && text) el.textContent = String(text); } catch (e) {}
    }
    function _openEncounter(worldId, ti, npc, startAtProfile) {
        _lobbyReg();
        (async () => {
            const worlds = await _get(K_WORLDS, []);
            const w = worlds.find(x => x.id === worldId);
            const t = w && w.travelers && w.travelers[ti];
            if (!t) { _toast('找不到這位旅人的資料'); return; }
            closeGate();   // 右側停靠位只有一張卡:世界門面板先讓位
            _closeMeet();
            const doc = win.document;
            _ensureStyle(doc);
            const host = doc.querySelector('.lobby-left') || doc.body;
            const box = doc.createElement('div');
            box.className = 'wg-meet';
            host.appendChild(box);
            _meetEl = box;
            const npcKey = 'wg_' + worldId + '_' + ti;
            const quiz = Array.isArray(t.quiz) ? t.quiz.filter(q => q && q.q && Array.isArray(q.options) && q.options.length >= 2) : [];
            let step = 0, goods = 0;
            box.style.setProperty('--npc-accent', _accentOf(t.name));
            // 海報覆蓋整個舞台,但要讓開既有的底部對話列——問題與反應都在那裡說出口,兩者是不同層、不能合併。
            //   對話列高度會因為輸入列/字數變,量一次寫進變數,比寫死安全。
            // 海報要讓開底部對話列。這裡有兩個都會咬人的細節:
            //   ① 不能只量 wrap 的 offsetHeight:名牌是 position:absolute;top:-22px,浮在對話框上緣之外,
            //      量不到它 → 面板下緣正好切在名牌上(實機回報「底部的對話框被遮住」就是這個)。
            //      改成掃 wrap 與它所有子孫,取最高的那條上緣。
            //   ② 不能只在開窗時量一次:台詞長短會讓那組東西改變高度 → 用 ResizeObserver 跟著改。
            try {
                const dw = doc.querySelector('.lobby-left .void-dialogue-wrap');
                if (dw) {
                    const sync = () => {
                        if (!box.isConnected) return;
                        // 純對話模式以外對話列是收起來的(display:none)→ 量不到也不必讓位,直接吃滿高度
                        if (!dw.offsetHeight) { box.style.setProperty('--wg-meet-pb', '0px'); return; }
                        const hostRect = (box.offsetParent || host).getBoundingClientRect();
                        let top = dw.getBoundingClientRect().top;
                        dw.querySelectorAll('*').forEach(el => {
                            const r = el.getBoundingClientRect();
                            if (r.height && r.top < top) top = r.top;
                        });
                        const gap = Math.max(0, Math.round(hostRect.bottom - top) + 8);
                        if (gap) box.style.setProperty('--wg-meet-pb', gap + 'px');
                    };
                    sync();
                    try { _meetRO = new win.ResizeObserver(sync); _meetRO.observe(dw); } catch (e) {}
                }
            } catch (e) {}
            // 外殼(海報/頁籤軌)只建一次,切頁只換兩個內容框——整顆重建會讓立繪和頁籤跟著閃。
            box.innerHTML =
                '<div class="wg-poster">' +
                  '<div class="wg-poster-plane"></div>' +
                  '<div class="wg-poster-name">' + _esc(t.name) + '</div>' +
                  '<div class="wg-poster-fig" data-fig><img class="wg-poster-figimg" alt=""></div>' +
                  '<div class="wg-poster-sig"><b>' + _esc(t.name) + '</b><span>' + _esc(t.job || '') + '</span>' +
                    (t.recruited ? '<i class="wg-joined"><i class="fa-solid fa-circle-check"></i> 已入隊</i>' : '') + '</div>' +
                '</div>' +
                '<div class="wg-shell">' +
                  '<div class="wg-ev-head"></div>' +
                  '<div class="wg-ev-text"></div>' +
                  '<div class="wg-ev-main"></div>' +
                  '<nav class="wg-tabs">' +
                    '<button class="wg-tab on" data-tab="talk">對話</button>' +
                    '<button class="wg-tab" data-tab="id">身分</button>' +
                  '</nav>' +
                '</div>' +
                '<button class="wg-meet-chat" title="切換"><i class="fa-solid fa-comment-dots"></i><b>聊天</b></button>' +
                '<button class="wg-meet-x" title="結束"><i class="fa-solid fa-xmark"></i></button>';
            // 🚨標題那組與內容(選項/身分卡欄位)是「兩個各自定位的容器」,不是同一欄由上往下排:
            //   底板是不規則形,白區能放字的地方不是一條垂直帶——綁成一欄就只能整組上下移,
            //   永遠對不上板子。標題/題幹/選項三段各一個框,在版位微調裡各自可拖。
            const headEl = box.querySelector('.wg-ev-head');
            const textEl = box.querySelector('.wg-ev-text');
            const mainEl = box.querySelector('.wg-ev-main');
            // ✕ = 離開這個人,不是只脫一層皮:走過去點旅人時是先 startTalk() 再開海報,
            //   只收海報會掉回「對話框還亮著」的中間態,要再按一次離開才回得到走路模式。
            //   右鍵開的身分卡沒有 startTalk 過(對話目標不是他)→ 那條只收海報,不動別人的對話。
            box.querySelector('.wg-meet-x').addEventListener('click', () => {
                const LS = win.LobbyStage || window.LobbyStage;
                if (LS && LS.getTalkTarget && LS.getTalkTarget() === npc) LS.endTalk();   // endTalk 內部會呼叫 closeMeet
                else _closeMeet();
            });
            // 💬 純對話模式:海報整個讓開、底部對話列回來,想自由打字聊天時用。
            //   組隊模式下對話列是收起來的——題目與反應本來就印在海報上,底下再放一份只是把畫面擠滿。
            host.classList.add('wg-host-on');
            box.querySelector('.wg-meet-chat').addEventListener('click', () => {
                const on = host.classList.toggle('wg-host-chat');
                box.classList.toggle('wg-chat', on);
                box.querySelector('.wg-meet-chat b').textContent = on ? '組隊' : '聊天';
                box.querySelector('.wg-meet-chat i').className = on ? 'fa-solid fa-reply' : 'fa-solid fa-comment-dots';
            });
            // 立繪是動態網址(IDB),只能在這裡掛成 CSS 變數(HTML 字串裡不寫 style)
            _figureOf(worldId, ti).then(f => {
                const el = box.querySelector('[data-fig]');
                if (!f || !el || !box.isConnected) return;
                if (f.sheet) { el.classList.add('sheet'); el.style.setProperty('--wg-fig', 'url("' + f.src + '")'); }
                else el.querySelector('.wg-poster-figimg').src = f.src;
            });

            const meta = (i, total) => '<div class="wg-ev-meta">組隊對談<b>' +
                String(i).padStart(2, '0') + '</b>/ ' + String(total).padStart(2, '0') + '</div>';
            // 🚨標題一律不用第三人稱代名詞:旅人資料沒有性別欄,寫「他」會有一半的人被叫錯。
            const page = (metaHtml, title, prompt, rest) => {
                headEl.innerHTML = metaHtml + '<div class="wg-ev-title">' + _esc(title) + '</div>';
                textEl.innerHTML = prompt ? '<div class="wg-ev-prompt">' + _esc(prompt) + '</div>' : '';
                mainEl.innerHTML = rest || '';
            };
            const choices = (arr) => '<div class="wg-choices">' + arr.map((c, n) =>
                '<button class="wg-choice" data-c="' + c.k + '"><span class="wg-choice-i">' +
                  String(n + 1).padStart(2, '0') + '</span><span class="wg-choice-t">' + _esc(c.t) + '</span></button>').join('') + '</div>';

            let cur = null;   // 目前的「對話」頁畫面(切回對話頁時重畫這個)
            async function joinTeam() {
                t.recruited = true;
                await _saveWorld(w);
                try { if (t.accept) win.LobbyStage.pushNpcHistory(npcKey, { role: 'assistant', content: t.accept }); } catch (e) {}   // 入隊宣言入他的記憶(考題過程不入)
                const sig = box.querySelector('.wg-poster-sig');
                if (sig && !sig.querySelector('.wg-joined')) sig.insertAdjacentHTML('beforeend', '<i class="wg-joined"><i class="fa-solid fa-circle-check"></i> 已入隊</i>');
                _toast(t.name + ' 加入了隊伍');
                if (_winEl && _curDetailId === w.id) _renderDetail(w);   // 面板正開著這個世界→隊伍狀態即時刷新
            }
            const renderProfile = () => {
                // 不放 persona 當題幹:下面的欄位表本來就有「性格」那列,擺上面等於同一句印兩次
                page('<div class="wg-ev-meta">旅人檔案</div>', t.name, '',
                    '<div class="wg-prof">' + _profRows(t) + '</div>');
            };
            const renderIntro = () => {
                cur = renderIntro;
                // 對話本體在底部對話框(開場白已seed成預設對話,打字=自由聊);這張海報只管組隊
                if (t.recruited) page('<div class="wg-ev-meta">同行中</div>', '已經同行', '世界門面板的出發編成可以看到隊伍狀態。', '');
                else page('<div class="wg-ev-meta">大廳偶遇</div>', '要不要一起走', t.persona || '',
                    choices([{ k: quiz.length ? 'quiz' : 'join', t: quiz.length ? '聊聊組隊的事' : '邀請入隊' }]));
                mainEl.querySelector('[data-c="quiz"]')?.addEventListener('click', () => { step = 0; goods = 0; renderQuiz(); });
                mainEl.querySelector('[data-c="join"]')?.addEventListener('click', async () => { await joinTeam(); renderResult(true, ''); });   // 舊世界資料沒考題→直接邀
            };
            const renderQuiz = () => {
                cur = renderQuiz;
                const q = quiz[step];
                _sayInDialog(q.q);   // 提問=底部對話框說出來
                const order = q.options.map((_, i) => i);
                for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }   // 洗選項順序,防AI把好答案固定放第一個
                page(meta(step + 1, quiz.length), '等你的回應', q.q,
                    choices(order.map(i => ({ k: i, t: q.options[i].t }))));
                mainEl.querySelectorAll('.wg-choice').forEach(el => el.addEventListener('click', () => {
                    const o = q.options[Number(el.dataset.c)];
                    if (o && o.good) goods++;
                    renderReact(o);
                }));
            };
            const renderReact = (o) => {
                const last = step >= quiz.length - 1;
                cur = () => renderReact(o);
                _sayInDialog((o && o.r) || '……');   // 反應也走對話框
                page(meta(step + 1, quiz.length), '聽完你的回答', (o && o.r) || '……',
                    choices([{ k: 'next', t: last ? '看看這趟要不要一起' : '下一題' }]));
                mainEl.querySelector('[data-c="next"]').addEventListener('click', async () => {
                    if (last) {
                        const ok = goods >= quiz.length;   // 三題全滿意才入隊(Rae 定案)
                        if (ok) await joinTeam();
                        renderResult(ok, ok ? t.accept : t.refuse);
                    } else { step++; renderQuiz(); }
                });
            };
            const renderResult = (ok, line) => {
                cur = () => renderResult(ok, line);
                _sayInDialog(line || (ok ? '(答應同行了。)' : '(搖了搖頭,婉拒了。)'));
                page(meta(quiz.length || 1, quiz.length || 1),
                    ok ? '答應同行了' : '頻率沒對上',
                    line || (ok ? '世界門面板的出發編成可以看到隊伍狀態。' : '待會可以再聊一次。'),
                    ok ? '' : choices([{ k: 'retry', t: '再聊一次' }]));
                mainEl.querySelector('[data-c="retry"]')?.addEventListener('click', () => { step = 0; goods = 0; renderQuiz(); });
            };
            // 頁籤只切兩個內容框:海報、外殼、頁籤軌都不重建
            box.querySelectorAll('.wg-tab').forEach(el => el.addEventListener('click', () => {
                box.querySelectorAll('.wg-tab').forEach(x => x.classList.toggle('on', x === el));
                if (el.dataset.tab === 'id') renderProfile(); else (cur || renderIntro)();
            }));
            renderIntro();
            if (startAtProfile) {   // 右鍵進來=直接開在身分頁(對話頁的畫面已經備好,切回去就有)
                box.querySelectorAll('.wg-tab').forEach(x => x.classList.toggle('on', x.dataset.tab === 'id'));
                renderProfile();
            }
        })();
    }

    // ── DIVE:切書→開場指令注入聊天→收面板 ──
    function _toChat(text) {
        try {
            const doc = win.document;
            const ta = doc.querySelector('#send_textarea'), btn = doc.querySelector('#send_but');
            if (!ta) return false;
            ta.value = text;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            try { ta.focus(); } catch (e) {}
            if (btn) setTimeout(() => btn.click(), 150);
            return true;
        } catch (e) { console.error('[Worldgate③] 注入聊天失敗', e); return false; }
    }
    // ══ 🚀 啟航封面圖(這趟隊伍的群像,VN 劇情末尾當底圖) ═════════════════
    // 這張圖不另外呼叫模型:主持AI 寫第一層正文的那一輪,手上剛好有隊伍名單與外觀基準,
    //   而且它才剛寫完這些人落地後被改造成什麼樣——那正是這張圖要畫的內容。
    //   另開一支副模型等於把它剛寫過的東西再問一次。
    // 時序剛好:正文一回來就開生,VN 要演好幾分鐘,生圖時間被演出吃掉,走到末尾面板時圖早就在了。
    // 🚨這段規則不包在 <request> 裡:她的正則把 <request> 區塊從「系統提示詞」也一起剝掉,
    //   包起來等於主持AI 根本讀不到這段。純文字寫在指令裡最保險。
    const _LAUNCH_REQ =
        // 🚨不講清楚它是什麼,模型會直接把它當場景插圖畫:出來的是「剛才那一幕」——
        //   幾個人圍著同一個東西、鏡頭推到臉上。但這張是面板的固定底圖,每次劇情演完都看到同一張,
        //   綁在某個瞬間本來就不成立。定義成「出發前的集結畫面」它才知道要畫待機而不是事件。
        '\n【啟航攝影】正文全部寫完之後,再輸出一段英文生圖關鍵詞。\n' +
        '🚨這不是劇情插圖,不要畫剛才正文裡發生的事,也不要畫任何正在發生的事件。\n' +
        '這是一張「出發前的集結畫面」:隊伍聚在他們落腳的地方,各自等著出發。' +
        '它是這個世界的固定門面,玩家每結束一段劇情都會再看到同一張,所以畫面不可以綁在某個瞬間上。\n' +
        '規則:\n' +
        // 🚨人數與性別一定要加權:只用普通描述寫,權重壓不過後面那幾行角色描述,生出來常常多人或少人。
        '1. 出場人數依當前名單:玩家可以單獨出場,也可以帶 1~4 名隊友。不得固定四人或固定性別比例,不得加入名單以外的人物。\n' +
        '1-1. 人數那一句必須照這個形狀寫成加權:(only N characters in scene:1.5),後面緊接著用英文寫出男女各幾人。' +
        'N 要跟你底下實際列出的角色行數一模一樣。\n' +
        '2. 性別只用 male、female;每名角色只寫一次性別與一次種族。\n' +
        '3. 人類標記 human;非人類必須標記明確種族。\n' +
        '4. 保留角色固定外貌;種族、服裝、職業、配件與身體構造跟隨當前世界觀,不得殘留上一個世界的元素。\n' +
        // 玩家指定過身分時,那一行不可以自己換一個:圖跟正文寫的是同一個人才對得上
        '4-1. 玩家如果指定過自己的身分,玩家那一行必須照那個身分寫(種族形態、能力路線、外觀),不可以另外編一個。\n' +
        // 外觀與動作寫在同一行:分成兩段會讓同一個人被描述兩次,重複本身就會讓模型算錯人數
        '5. 每名角色只用一行,行末以分號結尾,不編號、不寫姓名、不重複身分詞。' +
        '同一行裡先寫外觀,接著寫他此刻的待機動作。\n' +
        // 🚨景別要寫死:不明講「看得到腳」模型一律裁到胸口,四張臉塞滿畫面,環境完全看不到,
        //   而且介面沒地方擺。微俯是為了讓人互不遮擋又露出地面——壓成鳥瞰臉會變形,那是地圖不是啟程畫面。
        '6. 鏡頭與景別未指定時一律用 wide shot, full body, head to toe, feet visible, slightly high angle, wide-angle lens, 16:9;單人時同樣要全身入鏡。\n' +
        '7. 多人時角色位於同一個有限空間,彼此之間要留出間隔、互不遮擋、尺寸接近;不得擠成合照、不得只拍上半身,也不得有人站在遙遠背景。\n' +
        // 🚨「能不能一直維持下去」是待機與事件最好用的分界:整理裝備可以一直做,遞東西給誰不行。
        //   這條用性質判斷而不是舉例——舉了例子模型抄的是那個例子的形狀,每個世界都會端出同一套動作。
        '8. 每名角色各自處於等待出發的狀態。動作要是能一直維持下去的那種,不是某個事件的瞬間;' +
        '不得所有人圍著同一個東西、全部看向同一處,也不得兩個人互相對戲。\n' +
        // 地點不給範例:世界差異太大(有的根本沒有「房間」),只講性質讓它自己從世界條件推
        '8-1. 地點是他們在這個世界落腳、準備出發的地方,不是正文裡那個場景。那裡長什麼樣由這個世界自己的條件決定。' +
        '要有明確的空間感,看得出牆面、地面或邊界,不是一片空白或空無一物的背景。\n' +
        '9. 角色那幾行每次提到角色都用「髮色＋性別＋種族」;辨識特徵重複時再加入服裝特徵。禁止 he、she、the other character 這類含糊指代。\n' +
        // 這張圖是面板底圖:頭上與兩側那幾塊要留給介面,人塞滿了介面就沒地方擺、環境也看不到
        '10. 角色高度約佔畫面的一半,站在中間偏下;頭頂上方與左右兩側要留出環境空間,不要讓人物撐滿整個畫面。\n' +
        // 🚨行首那幾個字要正面要求寫出來:講「不要加標題」會被連行首標籤一起省掉(世界門那四行踩過)
        // 🚨標籤與行首都用 ASCII:中文標籤會被寫成簡體,一個字不一樣程式就整組認不到
        '輸出格式如下。標籤與三行的行首都必須原樣照抄下面的英文,不可翻譯、不可改寫、不可換成中文,程式要靠它們認位置:\n' +
        '<LaunchArt>\n' +
        // 微縮模型／等距那組詞擺在最前面:它決定整張圖的取景方式,放後面會被前面的內容詞蓋過去
        'Background: diorama, miniature, isometric, isometric concept, from above, front view, [畫風], [世界觀], [隊伍落腳處的室內或有邊界的空間], [光線與氣氛], wide shot, full body, head to toe, feet visible, slightly high angle, wide-angle lens, 16:9,\n' +
        'Characters: (only [人數] characters in scene:1.5), [男女各幾人的英文寫法],\n' +
        '[依當前名單,每名角色一行,行末分號:a/an + age + gender + species + 固定外貌 + 這個世界的服裝, is + 待機動作 ;]\n' +
        'in the [落腳處] , standing by, waiting to depart, evenly spaced apart\n' +
        '</LaunchArt>\n';
    // 隊伍組成當 key:重進舊世界目前是 0 次 API,不能因為又 DIVE 一次就重生一張圖。
    //   同一組人再進去＝重用上次那張;換過人才重新要一張。
    function _teamKey(w) {
        const names = (w.travelers || []).filter(t => t && t.recruited).map(t => String(t.name)).sort();
        return names.length ? names.join('/') : '(單人)';
    }
    function _needLaunchArt(w) {
        return !w.launchArt || !w.launchArt.url || w.launchArt.teamKey !== _teamKey(w);
    }
    // 開標籤取最後一個(思考鏈會先把標籤名唸一遍)、缺結束標籤照樣收到結尾(那正是被截斷的情況)。
    // 🚨標籤用 ASCII:中文標籤會被模型寫成簡體(它的思考鏈本來就常常是簡體,早期整包混進過世界書條目),
    //   差一個字就整組認不到。中文那兩個仍然收——預設或破甲裡若已經寫過,不必為了這件事改設定。
    // 三道都沒中就靠長相:那三行的行首本身就是判準,模型連標籤都省掉時還撿得回來。
    const _LAUNCH_TAGS = ['LaunchArt', '啟航攝影', '启航摄影'];
    function _pickLaunchBlock(text) {
        const s = String(text || '');
        for (let i = 0; i < _LAUNCH_TAGS.length; i++) {
            const tag = _LAUNCH_TAGS[i];
            const open = new RegExp('<\\s*' + tag + '[^>]*>', 'gi');
            let m, at = -1, len = 0;
            while ((m = open.exec(s))) { at = m.index; len = m[0].length; }
            if (at < 0) continue;
            const rest = s.slice(at + len);
            const end = rest.search(new RegExp('<\\s*/\\s*' + tag + '\\s*>', 'i'));
            return (end >= 0 ? rest.slice(0, end) : rest).trim();
        }
        // 標籤全省時的最後一道:從 Background 那行收到結尾。角色行的數量不固定,
        // 用空行當邊界會在模型多打一個換行時把名單砍掉一半 → 寧可多收,後面再按行過濾。
        const shape = s.match(/Background\s*:[\s\S]*$/i);
        return shape ? shape[0].trim() : '';
    }
    // 各行合成一段送進生圖。標籤行首留著沒關係(拿去 ComfyUI 對照過的就是這個長相),
    //   但把說明性的方括號殘留清掉,免得模型沒填的欄位原樣進了關鍵詞。
    // 🚨中文行一律丟掉:送進去的是英文關鍵詞,中文只可能是模型自己加的說明或收尾句。
    //   標籤全省時是從 Background 收到結尾的,那條路最容易把後面的中文一起撿進來。
    function _cjkRatio(s) {
        const t = String(s).replace(/\s/g, '');
        if (!t) return 0;
        return (t.match(/[一-鿿]/g) || []).length / t.length;
    }
    function _launchPrompt(block) {
        const lines = String(block || '').split('\n')
            .map(x => x.trim())
            .filter(x => x && !/^[<\[]/.test(x) && _cjkRatio(x) < 0.2);
        // 🚨模型把範本原樣抄回來時,角色那行是「[依當前名單,每名角色一行…]」,開頭是方括號會先被上面濾掉
        //   → 只剩兩行標籤就是「這趟沒有真的產出」,別送去生圖。用字數當判準擋不住:
        //   方括號拿掉之後標籤行本身就有四十幾個字。
        if (!lines.some(x => !/^(?:Background|Characters)\s*:/i.test(x))) return '';
        const t = lines.join(' ').replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
        return t.length > 40 ? t : '';
    }
    async function _genLaunchArt(w, promptText) {
        const IM = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
        if (!IM || typeof IM.generate !== 'function') return false;
        let url = '';
        // 走插圖桶(scene):它會自動套高清修復與修臉,群像要的正是這個;背景桶那條是給無人場景用的
        // 🚨尺寸傳進去會蓋掉圖片設置裡的預設值(那邊是 1024×1024 ≈ 105 萬像素)。
        //   原本給 1024×576 只有 59 萬像素,跌破模型的原生解析度 → 整張糊掉,
        //   高清修復救不了(它是放大已經糊掉的東西,補不回一開始就沒生出來的細節)。
        //   1344×768 是同一個比例(1.75)但像素回到 103 萬,構圖不變、清晰度回來,兩邊都還是 64 的倍數。
        // extraNegative 是「追加」不是覆蓋:她在圖片設置裡調好的負向詞照樣生效,這裡只多擋景別。
        // 🚨拉遠視角光靠正向詞不夠,模型的預設構圖偏好就是特寫;負面把特寫那幾種說法一起擋掉才穩。
        const CLOSE_NEG = 'close-up, extreme close-up, portrait, bust shot, head shot, cropped legs, cropped body, out of frame, faces filling the frame';
        // 跟概念圖共用同一組尺寸(理由寫在那個常數上面):同比例、不跌破原生解析度、不踩 NAI 的免費上限
        try { url = await IM.generate(promptText, 'scene', { width: _ART_W, height: _ART_H, extraNegative: CLOSE_NEG }) || ''; }
        catch (e) { console.warn('[Worldgate③] 啟航圖生成失敗', e && e.message); return false; }
        if (!url) return false;
        if (url.indexOf('blob:') === 0) {   // blob: 重載就失效 → 轉 dataURL 才存得住
            try {
                const blob = await (await fetch(url)).blob();
                url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => r(''); fr.readAsDataURL(blob); });
            } catch (e) {}
        }
        if (!url) return false;
        w.launchArt = { teamKey: _teamKey(w), url: url };
        await _saveWorld(w);
        console.log('[Worldgate③] 🚀 啟航圖已存入「' + w.name + '」(' + w.launchArt.teamKey + ')');
        return true;
    }
    // 訊息落地就掃。掛在這裡而不是 VN 那邊:要判斷「現在在哪個世界、這組隊伍有沒有圖了」,
    //   那兩份資料都在世界門手上。
    let _launchBusy = false;
    async function _scanLaunchArt(text) {
        if (_launchBusy) return;
        const id = await _getCurrentId();
        if (!id) return;                                   // 不在視差世界裡
        const worlds = await _get(K_WORLDS, []);
        const w = worlds.find(x => x.id === id);
        if (!w || !_needLaunchArt(w)) return;              // 這組隊伍已經有圖了
        const block = _pickLaunchBlock(text);
        if (!block) return;
        const p = _launchPrompt(block);
        if (!p) return;
        _launchBusy = true;
        try { await _genLaunchArt(w, p); } finally { _launchBusy = false; }
    }
    // 🏅 主持AI 發的成就名對得上清單就標記完成;對不上的完全不管——那是既有的即興成就,
    //   照樣走原本的柴郡／愛麗絲歸檔,跟這裡互不干擾。所以成就系統本體一行都不用改。
    // 比對前把標點與空白洗掉:它偶爾會多加引號或全形空格,那不該算成不同的成就。
    function _achvKey(s) {
        return String(s || '').replace(/[\s　「」『』"'·・,，。、.!！?？~～:：;；\-—_()（）\[\]【】]/g, '').toLowerCase();
    }
    function _allAchv(w) {
        const a = w && w.achv;
        return a ? [].concat(a.normal || [], a.bond || [], a.hidden || []) : [];
    }
    async function _scanAchv(text) {
        const id = await _getCurrentId();
        if (!id) return;
        const worlds = await _get(K_WORLDS, []);
        const w = worlds.find(x => x.id === id);
        const list = _allAchv(w);
        if (!list.length) return;
        const got = [];
        const re = /\[Achievement\|([^\]|]*)\|([^\]|]*)\|/gi;   // [Achievement|表情|名|描述]
        let m;
        while ((m = re.exec(String(text || '')))) got.push(m[2].trim());
        if (!got.length) return;
        const done = Object.assign({}, w.achvDone || {});
        let hit = 0;
        got.forEach(n => {
            const k = _achvKey(n);
            const t = list.find(x => _achvKey(x.name) === k);
            if (t && !done[t.name]) { done[t.name] = Date.now(); hit++; }
        });
        if (!hit) return;
        w.achvDone = done;
        await _saveWorld(w);
        console.log('[Worldgate③] 🏅「' + w.name + '」達成 ' + hit + ' 條世界成就');
    }
    function _initLaunchHook() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(_initLaunchHook, 1000); return; }
        const ev = win.tavern_events;
        if (!ev.MESSAGE_RECEIVED) return;
        win.eventOn(ev.MESSAGE_RECEIVED, async function (messageId) {
            try {
                if (win.__AURELIA_SUMMARIZING) return;     // 🚫 大總結的呼叫也發這個事件,別跟著生圖
                const msgs = await win.TavernHelper?.getChatMessages?.(messageId);
                const m = msgs && msgs[0];
                if (!m || m.is_user) return;
                const _t = m.message || m.mes || '';
                await _scanAchv(_t);          // 先記成就:生圖那支會等好幾十秒,不要卡著它
                await _scanLaunchArt(_t);
            } catch (e) {}
        });
        console.log('[Worldgate③] 🚀 啟航圖便車已掛載');
    }
    _initLaunchHook();

    // 🚨換聊天室要重新對燈:條目的常駐燈是全域的,「人在哪個世界」卻是每個聊天室各自的。
    //   沒有這一條的話,舊世界的燈會一直亮著,新聊天室生成世界時整份被餵進去(她實測撞到)。
    //   _syncWorldLamps 自己有「已經是對的就不寫」的守衛,所以重複觸發不會反覆寫世界書。
    function _initChatHook() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(_initChatHook, 1000); return; }
        const ev = win.tavern_events;
        if (!ev.CHAT_CHANGED) return;
        const _resync = async () => {
            try { await _migrateCurrent(); } catch (e) {}
            let id = '';
            try { id = await _getCurrentId(); } catch (e) {}
            // 🚨切書狀態綁在角色卡上，「人在哪個世界」綁在聊天室 → 兩者會脫節：
            //   在 A 室進了世界(表世界主書被卸下)，換到沒進過世界的 B 室，綁定還停在視差模式，
            //   B 室等於連表世界書都沒有。所以換室時把綁定校正回這個聊天室該有的樣子。
            //   兩支都有「已經是這個狀態就不寫」的守衛，非奧瑞亞卡也會自己拒絕，不會反覆寫綁定。
            try {
                const g = _gate();
                if (g) { if (id) await g.enterParallax(); else await g.exitParallax(); }
            } catch (e) {}
            try { await _syncWorldLamps(id); } catch (e) {}
        };
        // 延遲是等酒館把 chatId 切過去,太早讀到的還是上一個聊天室(同 vn_free_mode 的作法)
        win.eventOn(ev.CHAT_CHANGED, () => { setTimeout(_resync, 800); });
        setTimeout(_resync, 3000);   // 開機也對一次:上一輪關掉時停在哪個世界不算數
        console.log('[Worldgate③] 🔄 換聊天室自動對燈已掛載');
    }
    _initChatHook();

    function _divePrompt(w) {
        const team = (w.travelers || []).filter(t => t.recruited);
        const teamStr = team.length
            ? team.map(t => '- ' + t.name + '(' + t.job + '):' + t.persona + ';擅長' + t.skill).join('\n')
            : '(單人行動)';
        // 外觀基準跟著開場指令一起送：[Avatar] 那幾行就是在這一輪輸出的,慢一步就定型成另一個人了
        const lookStr = team.filter(t => t.sprite).map(t => '- ' + t.name + ':' + t.sprite).join('\n');
        return '🌌 NEXUS PARALLAX · 世界啟動\n' +
            '━━━━━━━━━━━━━━━━━━━━━\n' +
            '[System:玩家從純白大廳進入視差世界「' + w.name + '」]\n' +
            '世界概念:' + w.concept + '(' + (w.genre ? '題材:' + w.genre + ' ' : '') + '風格:' + w.style + ')\n' +
            '同行旅人:\n' + teamStr + '\n' +
            (lookStr ? '\n旅人的視差原樣(外觀基準,跨世界固定):\n' + lookStr + '\n' : '') +
            (w.spawn ? '降生地:' + w.spawn + '(玩家指定,開場就從這裡起)\n' : '') + '\n' +
            '【指令】\n' +
            // 開場就是她看到「兩腳獸在海底游」的地方——身體轉化要在這裡當場發生,不能等世界檔案裡寫過就算數
            '0. 玩家與同行旅人都是從奧瑞亞進來的人類,抵達時會依這個世界的法則被改造成能在這裡生存的形態(世界檔案第三節寫的那個)。' +
            '開場必須寫出他們發現自己身體變了的那一刻,之後全篇都用改造後的身體描寫他們——不要讓人類身體靠裝備在這個世界裡通行。\n' +
            // 🚨玩家指定的身分要緊接在指令0後面:身體改造就是在那條裡決定的,隔太遠會被當成背景資訊忽略。
            //   措辭一定要硬——寫成「可參考」「盡量」會被當裝飾(抽種子的偏好詞吃過這個虧)。
            (w.pc ? '0-1. 【玩家指定的身分·最高優先】玩家這一趟要當的是:' + w.pc + '。' +
                '這是玩家自己決定的,不是給你參考的建議。改造後的形態、能力路線與外觀一律照這個寫,' +
                '不可以換成別的種族、別的職業,也不可以改成你覺得更合適或更符合這個世界的版本。' +
                '如果它跟這個世界的法則看起來有衝突,要用這個世界自己的說法讓它成立(當地人怎麼稱呼這種人、' +
                '這種能力在這裡算什麼),而不是把它改掉。\n' : '') +
            // 改造的是種族形態與衣著,不是換一個人:髮色髮型/瞳色/年齡/體型是這個旅人跨世界的身分認得出來的地方
            // 編號要連續:沒填身分時直接跳到 0-2 會讓模型去找一條不存在的 0-1
            (lookStr ? (w.pc ? '0-2. ' : '0-1. ') + '上面的「視差原樣」是每位旅人本人的樣貌。描寫他們、或輸出 [Avatar] 那行時,' +
                '髮色髮型、瞳色、年齡檔、體型一律照那串寫,不可另編一個人;種族形態寫改造後的樣子;' +
                '服裝依這個世界的民族與職業改寫,不必照抄視差那套便服。\n' : '') +
            '1. 以「' + w.name + '」的世界檔案為準,從' + (w.spawn ? '「' + w.spawn + '」' : '入口區域') + '開場,描寫玩家(與同行旅人)抵達時的所見所感。' +
            (w.genre ? '全篇用「' + w.genre + '」的語彙書寫,不得混入不屬於此題材的科技或現代說法。' : '') + '\n' +
            '2. 遵循視差跑團主持規範:不強推主線、只描述可感知資訊、事件制推進。' +
            '世界檔案裡的法則與危機是這個地方的背景質地,不是玩家的任務——不要拿它當開場鉤子逼玩家表態或選邊,玩家要在這裡做生意、找人、閒晃都可以。\n' +
            // 🚨不講的話模型會套「玩家＝主角＝隊長」的預設,四個旅人變成等指令的工具人。
            //   他們是各自報名、在大廳湊在一起的陌生人,身上本來就有自己的目標與翻臉條件(條目裡都寫了)。
            (team.length ? '2-1. 同行旅人不是玩家的部下,也沒有推舉玩家當隊長。他們各自有自己的目標與底線,' +
                '對玩家的信任要靠相處累積,不會因為玩家開口就照做。' +
                '不要讓他們主動請示、等候指令、或把決定權推給玩家;他們有意見會自己講,不同意會自己說,' +
                '也可以自己去做想做的事。玩家要他們配合,得用說服、交換或交情換來。\n' : '') +
            '3. 開場結尾給出眼前可見的幾個方向或機會,然後停下等待玩家行動。\n' +
            // 🚨開場指令本身是一大段散文,不點名格式的話模型會照著這個調性寫下去,整章變成小說敘述體,
            //   面板讀不到標記就只顯示一大塊文字。這裡只給錨點,完整規範照這張卡自己那份走——
            //   在這裡複述整份規範,她改了規範這邊就變成過期的第二版本。
            '4.【輸出格式】用 VN 面板格式輸出,不是小說。角色說話一律走 [Char|…] 那種行,' +
            '章節開頭給 [Chapter|…],立繪、場景、背景等標記照這張卡既有的 VN 規範走。' +
            '不要把對白與敘述混成整段散文。\n' +
            // 這組隊伍已經有封面就不要再帶這段:重進舊世界本來是 0 次 API,不能每次 DIVE 都多背一份規則
            (_needLaunchArt(w) ? _LAUNCH_REQ : '') +
            '━━━━━━━━━━━━━━━━━━━━━';
    }
    async function _dive(w) {
        const gate = _gate();
        if (!gate) return { ok: false, msg: '切書模組不可用' };
        const r = await gate.enterParallax();
        if (!r.ok) return r;
        // 隊伍在按下 DIVE 這刻定案(下面馬上 _clearTravelers 清場,之後不會再變)
        // → 先把條目的旅人區塊刷成「這趟真正同行的人」,免得開場指令說單人行動、世界檔案裡卻躺著沒招募的人。
        if (w.entryText) { try { await _writeEntry(w, w.entryText); } catch (e) { console.warn('[Worldgate] DIVE 前更新世界條目失敗', e); } }
        const sent = _toChat(_divePrompt(w));
        if (!sent) { await gate.exitParallax(); return { ok: false, msg: '找不到酒館輸入框,已切回主世界' }; }
        w.visits = (w.visits || 0) + 1;
        const worlds = await _get(K_WORLDS, []);
        const i = worlds.findIndex(x => x.id === w.id);
        if (i >= 0) worlds[i] = w;
        await _set(K_WORLDS, worlds);
        // 這個聊天室從此屬於這個世界（app_data 是 chat-scope，換聊天室就換世界、回來還原）
        //   → 依題材翻「-VN小說家-」的模組條目：奇幻世界不給手機、和平題材不給戰鬥、BGM 換成對應那條
        await _setCurrentId(w.id);
        await _syncWorldLamps(w.id);   // 這個世界改成常駐、其餘關掉——不靠關鍵字，也不用人記得切
        try { window.WORLD_RULES && window.WORLD_RULES.sync('DIVE'); } catch (e) {}
        _clearTravelers(); _closeMeet();
        // 大廳那層對話也要收:DIVE 是點愛麗絲開的面板,面板收掉後她的對話框還亮著＝
        // 人已經穿越到別的世界了,畫面卻還停在跟她講話。
        try { (win.LobbyStage || window.LobbyStage)?.endTalk?.(); } catch (e) {}
        return { ok: true, msg: '已進入「' + w.name + '」' };
    }

    // ════════════════════════════════════════════════════════
    // UI:量子白停靠窗(仿書咖 dock 幾何;兩層換頁:檔案庫⇄種子/詳情)
    // ════════════════════════════════════════════════════════
    function _ensureStyle(doc) {
        if (doc.getElementById('os-wg-style')) return;
        const st = doc.createElement('style');
        st.id = 'os-wg-style';
        st.textContent =
            /* 🌌 量子白:純白大廳配色(白霧面板+墨藍字+銀光點綴),跟愛麗絲站在一起不突兀 */
            '.wg-win{position:absolute;right:max(2.2%,calc(50% - 410px));top:50%;transform:translateY(-50%);z-index:3350;width:400px;max-width:52%;min-height:min(500px,74%);max-height:80%;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(rgba(250,251,255,.97),rgba(238,240,246,.97));border:1px solid rgba(26,28,40,.16);border-radius:16px;color:#1A1C28;font-size:13px;box-shadow:0 14px 40px rgba(26,28,40,.28),inset 0 0 0 3px rgba(255,255,255,.5);backdrop-filter:blur(8px);}' +
            '.wg-head{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid rgba(26,28,40,.1);background:rgba(255,255,255,.55);}' +
            '.wg-brand{display:flex;align-items:center;gap:9px;min-width:0;}.wg-brand-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#1A1C28;color:#fff;font-size:16px;box-shadow:0 3px 9px rgba(26,28,40,.22);}' +
            '.wg-brand-copy{display:flex;flex-direction:column;line-height:1.05;white-space:nowrap;}.wg-brand-copy b{font-size:15px;letter-spacing:.06em;}.wg-brand-copy small{margin-top:4px;color:#8a8ea6;font-size:8px;letter-spacing:.18em;font-weight:700;}' +
            '.wg-mode-pill{margin-left:auto;display:flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid rgba(26,28,40,.14);border-radius:8px;background:rgba(255,255,255,.6);color:#5a5e75;font-size:10px;font-weight:700;white-space:nowrap;}' +
            '.wg-mode-pill.para{background:#1A1C28;color:#EAF2FF;border-color:#1A1C28;}' +
            '.wg-body{overflow-y:auto;padding:11px 13px 14px;flex:1;display:flex;flex-direction:column;scrollbar-color:rgba(26,28,40,.25) transparent;scrollbar-width:thin;}' +
            '.wg-empty{margin:auto;color:#8a8ea6;padding:24px 6px;text-align:center;line-height:1.8;}.wg-empty i{display:block;margin-bottom:8px;color:#b9bed4;font-size:28px;}' +
            '.wg-section-head{display:flex;align-items:center;justify-content:space-between;margin:0 1px 8px;color:#3a3e56;}.wg-section-title{font-weight:800;font-size:13px;letter-spacing:.04em;}.wg-section-note{color:#8a8ea6;font-size:10px;}' +
            '.wg-card{margin-bottom:8px;padding:10px 12px;border:1px solid rgba(26,28,40,.13);border-radius:12px;background:rgba(255,255,255,.72);box-shadow:0 2px 7px rgba(26,28,40,.05);}' +
            '.wg-card.click{cursor:pointer;transition:transform .15s,background .15s,border-color .15s;}.wg-card.click:hover{transform:translateY(-1px);background:#fff;border-color:rgba(26,28,40,.3);}' +
            '.wg-card.sel{border-color:#1A1C28;box-shadow:0 0 0 1px #1A1C28;background:#fff;}' +
            // 檔案庫管理模式:標題列右邊的小鈕(管理/全選),勾選框直接借用卡片標題原本那顆圖示的位置
            '.wg-head-acts{display:flex;align-items:center;gap:7px;}' +
            // 🩺 體檢提示列：只在「世界書沒掛在這張卡上」時出現
            '.wg-warn{display:flex;align-items:center;gap:8px;margin:0 1px 9px;padding:9px 11px;border-radius:10px;' +
              'background:rgba(180,80,60,.09);border:1px solid rgba(180,80,60,.28);color:#a05040;font-size:11px;line-height:1.55;}' +
            '.wg-warn i{flex:none;}.wg-warn span{flex:1;min-width:0;}' +
            '.wg-warn .wg-mgr-btn{flex:none;background:rgba(180,80,60,.14);border-color:rgba(180,80,60,.3);color:#a05040;}' +
            '.wg-warn .wg-mgr-btn:hover{background:#a05040;color:#fff;border-color:#a05040;}' +
            '.wg-mgr-btn{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:9px;cursor:pointer;' +
              'font-family:inherit;font-size:10px;font-weight:700;color:#5a5e75;background:rgba(26,28,40,.06);border:1px solid rgba(26,28,40,.12);}' +
            '.wg-mgr-btn:hover,.wg-mgr-btn.on{background:#1A1C28;color:#fff;border-color:#1A1C28;}' +
            '.wg-card.pick .wg-card-title>i:first-child{color:#8a8ea6;}' +
            '.wg-card.pick.sel .wg-card-title>i:first-child{color:#1A1C28;}' +
            '.wg-card-title{display:flex;align-items:center;gap:6px;font-weight:800;color:#22263c;}.wg-card-title .wg-visits{margin-left:auto;color:#8a8ea6;font-size:9px;font-weight:700;white-space:nowrap;}' +
            '.wg-card-sub{color:#5a5e75;font-size:11px;margin-top:3px;line-height:1.5;}' +
            '.wg-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;}.wg-tag{padding:1px 6px;border-radius:9px;background:rgba(26,28,40,.06);color:#5a5e75;font-size:9px;border:1px solid rgba(26,28,40,.08);}' +
            '.wg-tag.warn{background:rgba(180,80,60,.08);color:#a05040;border-color:rgba(180,80,60,.2);}' +
            // 降生地九宮格：純 CSS 排方位，不生任何圖
            // 🚨flex:none 不能省:.wg-body 是直向 flex,圖片當 flex item 預設會被壓扁(實測高度只剩幾十px)。
            //   aspect-ratio + cover 是第二道保險,圖片比例跟預期不同時也不會變形。
            '.wg-art{position:relative;flex:none;border-radius:12px;overflow:hidden;margin-bottom:8px;line-height:0;background:rgba(26,28,40,.06);}' +
            '.wg-art img{width:100%;height:auto;display:block;aspect-ratio:12/7;object-fit:cover;}' +
            // 概念句＋三顆標籤壓在概念圖上(詳情頁)：底下那張漸層布幕是必要的，
            //   概念圖的下緣亮暗完全看世界長什麼樣，沒有布幕時白字會在亮景上整段消失。
            '.wg-art-ov{position:absolute;left:0;right:0;bottom:0;padding:22px 11px 9px;line-height:normal;' +
              'background:linear-gradient(rgba(10,12,22,0),rgba(10,12,22,.34) 38%,rgba(10,12,22,.78));}' +
            '.wg-art-concept{color:#fff;font-size:15px;font-weight:800;letter-spacing:.6px;line-height:1.35;text-shadow:0 1px 8px rgba(10,12,22,.6);}' +
            '.wg-art .wg-tags{margin-top:6px;}' +
            '.wg-art .wg-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10px;font-weight:700;' +
              'background:rgba(255,255,255,.16);color:#f0f3ff;border-color:rgba(255,255,255,.32);backdrop-filter:blur(4px);}' +
            '.wg-art .wg-tag.lure{background:rgba(70,170,130,.3);border-color:rgba(150,235,200,.5);}' +
            '.wg-art .wg-tag.warn{background:rgba(190,80,70,.32);color:#ffe9e6;border-color:rgba(255,160,150,.5);}' +
            // ── 🧍 出發編成：四格槽位(素材=sound-files/aseets/worldgate_ui 前後兩層玻璃艙) ──
            //   前後夾層的用意：人站在後層玻璃與腳下光環之上、又被前框與底座包住＝真的進到艙裡，
            //   單張完整殼會把頭髮衣服壓白。兩層必須同尺寸同定位(素材已用同一個 bbox 裁好)。
            '.wg-slots{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px;}' +
            '.wg-slot{display:flex;flex-direction:column;align-items:center;min-width:0;}' +
            '.wg-slot.on{cursor:pointer;}' +
            '.wg-slot-shell{position:relative;width:100%;aspect-ratio:320/656;}' +
            '.wg-slot-shell>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}' +
            '.wg-slot-back{z-index:1;}.wg-slot-front{z-index:3;pointer-events:none;}' +
            // 人物框內縮：上下留給頂框與底座，腳底落在光環上(contain+bottom 對齊)
            '.wg-slot-fig{position:absolute;inset:7% 11% 17% 11%;z-index:2;background:var(--wg-fig) center bottom/contain no-repeat;}' +
            // 走路圖(3×4)當皮膚時只取第一格，不然整張 12 宮格塞進艙裡
            '.wg-slot-fig.sheet{background-size:300% 400%;background-position:0 0;}' +
            '.wg-slot-ghost{position:absolute;inset:7% 11% 17% 11%;z-index:2;display:grid;place-items:center;color:rgba(120,140,190,.34);font-size:26px;}' +
            '.wg-slot.empty .wg-slot-shell{opacity:.62;}' +
            // 🚨 top 的百分比吃的是「高度」不是寬度：槽位高是寬的兩倍，-6% 會把菱石甩到艙外、還撞到上一行標題。
            //   改成把菱石的「中心」壓在頂框橫桿上(top:3% + translate -50%,-50%)，尺寸也收小一級。
            '.wg-slot-gem{position:absolute;top:3%;left:50%;z-index:4;width:26%;aspect-ratio:1;display:grid;place-items:center;' +
              'transform:translate(-50%,-50%) rotate(45deg);border-radius:4px;background:linear-gradient(140deg,#fdfefe,#cfe0f5);' +
              'border:1px solid rgba(120,150,200,.55);box-shadow:0 1px 5px rgba(26,28,40,.22);}' +
            '.wg-slot-gem i{transform:rotate(-45deg);font-size:9px;color:#3a5580;}' +
            '.wg-slot-check{position:absolute;right:4%;bottom:20%;z-index:4;color:#2f6fd0;font-size:13px;' +
              'filter:drop-shadow(0 1px 3px rgba(255,255,255,.9));}' +
            '.wg-slot-name{margin-top:-6%;position:relative;z-index:5;max-width:100%;padding:2px 7px;border-radius:8px;' +
              'background:#1e2540;color:#fff;font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
              'box-shadow:0 2px 6px rgba(26,28,40,.3);}' +
            '.wg-slot.empty .wg-slot-name{background:#5b6480;}' +
            '.wg-slot-job{margin-top:4px;max-width:100%;display:flex;align-items:center;gap:3px;color:#5a5e75;font-size:9px;' +
              'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '.wg-slot-job i{color:#3a5580;font-size:8px;flex:none;}' +
            '.wg-spawn-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:4px;}' +
            // 有方位圖時格子疊在圖上面:底板要壓暗一點,不然白底的格子跟圖糊在一起看不出邊界
            '.wg-spawn-grid.has-map{background-image:var(--wg-map);background-size:cover;background-position:center;padding:5px;border-radius:11px;}' +
            '.wg-spawn-grid.has-map .wg-spawn{background:rgba(255,255,255,.86);}' +
            '.wg-spawn-grid.has-map .wg-spawn-empty{border-color:rgba(255,255,255,.42);}' +
            '.wg-spawn-empty{border-radius:9px;border:1px dashed rgba(26,28,40,.07);min-height:44px;}' +
            '.wg-spawn{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:44px;padding:6px 7px;cursor:pointer;border-radius:9px;' +
              'border:1px solid rgba(26,28,40,.16);background:rgba(255,255,255,.78);transition:transform .15s,background .15s,border-color .15s;}' +
            '.wg-spawn:hover{transform:translateY(-1px);background:#fff;border-color:rgba(26,28,40,.34);}' +
            '.wg-spawn.on{border-color:#1A1C28;box-shadow:0 0 0 1px #1A1C28;background:#fff;}' +
            '.wg-spawn-n{font-size:10px;font-weight:800;color:#22263c;line-height:1.25;}' +
            '.wg-spawn-s{font-size:8px;color:#7a7e95;line-height:1.3;}' +
            '.wg-btn{width:100%;margin-top:10px;background:#1A1C28;border:1px solid #1A1C28;color:#fff;font-weight:800;border-radius:11px;padding:10px 0;cursor:pointer;font-size:12px;box-shadow:0 4px 10px rgba(26,28,40,.2);}' +
            '.wg-btn:disabled{opacity:.4;cursor:default;box-shadow:none;}' +
            '.wg-btn.ghost{background:rgba(255,255,255,.6);color:#3a3e56;border:1px solid rgba(26,28,40,.18);box-shadow:none;}' +
            '.wg-btn.danger{background:rgba(180,80,60,.1);color:#a05040;border:1px solid rgba(180,80,60,.3);box-shadow:none;}' +
            '.wg-btn-row{display:flex;gap:7px;}.wg-btn-row .wg-btn{flex:1;}' +
            '.wg-note{color:#8a8ea6;font-size:10px;text-align:center;margin-top:7px;line-height:1.5;}' +
            '.wg-loading{margin:auto;display:flex;flex-direction:column;align-items:center;gap:12px;color:#8a8ea6;font-size:11px;letter-spacing:2px;font-weight:700;}' +
            '.wg-spinner{width:26px;height:26px;border:2px solid rgba(26,28,40,.15);border-top-color:#1A1C28;border-radius:50%;animation:wgSpin 1s linear infinite;}' +
            '@keyframes wgSpin{to{transform:rotate(360deg)}}' +
            '.wg-input{width:100%;box-sizing:border-box;margin-top:8px;background:rgba(255,255,255,.8);border:1px solid rgba(26,28,40,.16);border-radius:9px;color:#1A1C28;padding:8px 10px;font-size:11px;}' +
            '.wg-input::placeholder{color:#a0a4ba;}' +
            '.wg-input.area{resize:vertical;min-height:58px;line-height:1.6;font-family:inherit;}' +
            '.wg-entry-text{color:#3a3e56;font-size:11px;line-height:1.7;white-space:pre-wrap;}' +
            /* 🤝 組隊海報:左角色海報 + 右事件殼,覆蓋舞台但讓開底部對話列(問題與反應在那裡說出口,兩者不同層不能合併)。
               整套純 CSS(斜切/巨大姓名/選項列都是即時文字),不切任何 PNG——切了就換不了角色、換不了題數。 */
            // 🚨底板是「有形狀」的透明 PNG,兩張板之間與板外一律透空——底下是大廳的像素場景,
            //   不鋪一層霧的話整個舞台從縫隙透上來,字直接讀不到(harness 用的是純色假背景,看不出這件事)。
            '.wg-meet{position:absolute;left:0;right:-0.1%;top:0;bottom:var(--wg-meet-pb,150px);z-index:3355;display:flex;' +
              'background:rgba(240,244,250,.82);backdrop-filter:blur(7px);' +
              'color:var(--party-ink,#14243d);font-size:13px;--party-navy:#10243d;--party-muted:#60718a;--party-gold:#c9aa72;--npc-accent:#35c9e8;}' +
            '.wg-meet-x{position:absolute;right:12px;top:12px;z-index:6;width:32px;height:32px;border-radius:50%;cursor:pointer;' +
              'border:1px solid rgba(20,36,61,.22);background:rgba(255,255,255,.92);color:#14243d;font-size:14px;box-shadow:0 2px 10px rgba(14,24,40,.18);}' +
            '.wg-meet-x:hover{background:#10243d;color:#fff;}' +
            // 🚨大廳的狀態 class 用 wg-host-* :叫 wg-meet-chat 會跟切換鈕的 class 同名,
            //   .wg-meet-chat{position:absolute;height:32px;border-radius:16px…} 那條就整組套到 .lobby-left 上。
            // 💬 組隊模式:底部對話列收起來(題目與反應都印在海報上了,再放一份只是把畫面擠滿)
            '.lobby-left.wg-host-on .void-dialogue-wrap{display:none;}' +
            '.lobby-left.wg-host-on.wg-host-chat .void-dialogue-wrap{display:block;}' +
            // 🚨立繪也要一起收:一般對話模式的 .lstage-talk-portrait 是掛在 .lobby-left 底下的獨立元素,
            //   不在 .void-dialogue-wrap 裡面 → 只收對話列的話它會留在原地,
            //   海報底是半透明的,於是同一個人的立繪在畫面上出現兩張(海報一張、背景一張)。
            //   切到聊天模式時海報整個讓開,那張立繪就該回來 → 用 :not() 一條解決,不必寫還原規則。
            '.lobby-left.wg-host-on:not(.wg-host-chat) .lstage-talk-portrait{display:none;}' +
            '.wg-meet-chat{position:absolute;right:52px;top:12px;z-index:6;display:inline-flex;align-items:center;gap:6px;' +
              'height:32px;padding:0 13px;border-radius:16px;cursor:pointer;border:1px solid rgba(20,36,61,.22);' +
              'background:rgba(255,255,255,.92);color:#14243d;font-size:12px;font-weight:800;font-family:inherit;' +
              'box-shadow:0 2px 10px rgba(14,24,40,.18);}' +
            '.wg-meet-chat:hover{background:#10243d;color:#fff;}' +
            // 純對話模式:海報整個讓開,只留這顆鈕浮著;面板本身不吃點擊,免得擋到大廳
            '.wg-meet.wg-chat{background:none;backdrop-filter:none;pointer-events:none;}' +
            '.wg-meet.wg-chat .wg-poster,.wg-meet.wg-chat .wg-shell,.wg-meet.wg-chat .wg-meet-x{display:none;}' +
            '.wg-meet.wg-chat .wg-meet-chat{pointer-events:auto;right:12px;}' +
            /* ── 左:角色海報(底板圖 + 巨大描邊姓名 + 立繪 + 代號) ──
               底板是阿洛拆好的透明 PNG(白斜板/墨藍階梯/細金線/水藍刻度/點陣),不用 CSS 重畫——
               clip-path 只畫得出色塊，畫不出那些細節，實測就是差一截。 */
            '.wg-poster{position:relative;flex:0 0 40%;min-width:0;}' +
            // 100% 100% 不等比:海報欄的長寬比會隨舞台變，contain 會露出四周空隙、cover 會把邊上的金線刻度切掉。
            //   底板幾乎全是直線與斜線，小幅拉伸看不出來，缺角/缺線一眼就看得出來。
            '.wg-poster-plane{position:absolute;inset:0;background:url("' + _WG_ART + 'poster-plate.png") center/100% 100% no-repeat;' +
              'filter:drop-shadow(0 12px 30px rgba(14,24,40,.24));}' +
            // 巨大姓名只當背景圖形：描邊透明字、直排，壓在立繪後面
            // 🚨字型一定要指定粗黑體:沒指定會掉到比較細的字面,字的筆畫比外框線還細,
            //   描邊描在筆畫兩側就變成兩條快要重合的線,交叉處整個糊掉(實測 A/B 對照)。
            '.wg-poster-name{position:absolute;left:5%;top:5%;z-index:2;writing-mode:vertical-rl;letter-spacing:6px;' +
              'font-family:"Microsoft JhengHei","Noto Sans TC","PingFang TC",sans-serif;' +
              'font-size:clamp(34px,11vh,96px);line-height:1.12;font-weight:900;color:transparent;-webkit-text-stroke:1.5px rgba(53,110,175,.4);pointer-events:none;}' +
            // 立繪是像素小人：放大時一律 pixelated，別讓瀏覽器插值糊成一團
            // 右邊要留給代號牌：圖框佔滿整個海報的話，人一定壓在代號上(斜板本來就往右收窄)
            // 🚨立繪不能用 contain:那是「整張塞進框裡」,遇到比較寬的素材(髮型/道具/鰭把畫布撐寬)會改以寬度為準縮小,
            //   同一個框裡不同角色就一大一小。改成一律對齊框高(height:100%),角色高度才會一致;
            //   而且用 <img> 不用背景圖——背景一定裁在框邊,img 可以往兩側溢出,過寬的頭髮不會被切掉。
            '.wg-poster-fig{position:absolute;inset:5.3% 12.9% 1.5% 6.6%;z-index:3;overflow:visible;}' +
            '.wg-poster-figimg{position:absolute;left:50%;bottom:0;height:100%;width:auto;max-width:130%;' +
              'transform:translateX(-50%);image-rendering:pixelated;}' +
            '.wg-poster-fig.sheet{image-rendering:pixelated;background:var(--wg-fig) 0 0/300% 400% no-repeat;}' +
            '.wg-poster-fig.sheet .wg-poster-figimg{display:none;}' +
            '.wg-poster-sig{position:absolute;right:2%;bottom:49.9%;z-index:4;display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right;}' +
            '.wg-poster-sig b{font-size:17px;font-weight:800;letter-spacing:3px;color:#14243d;}' +
            '.wg-poster-sig span{font-size:12px;letter-spacing:2px;color:var(--party-muted);border-top:1px solid var(--party-gold);padding-top:3px;}' +
            '.wg-joined{display:inline-flex;align-items:center;gap:3px;margin-top:5px;padding:2px 8px;border-radius:8px;background:rgba(60,120,80,.14);color:#2f6b46;font-size:10px;font-style:normal;font-weight:800;white-space:nowrap;}' +
            /* ── 右:事件殼(白霧玻璃 + 斜切角),頁籤軌固定在殼內最下緣 ── */
            // 事件底板用的是切掉最下面那條墨藍基座的版本:那條把三等分畫死了,而這裡只有兩個頁籤。
            //   頁籤軌改用獨立的 tab-rail(分隔線也已抹掉),寬高怎麼變都不會對不上。
            // 🚨 min-height:0 不能省:手機是直向 flex,沒有它 flex item 撐不下就往外長(min-height:auto),
            //    整個殼會溢出面板、頁籤軌掉到底部對話列上面。桌機是橫向所以只有 min-width 生效,兩個都要留。
            '.wg-shell{position:relative;flex:1 1 60%;min-width:0;min-height:0;' +
              'background:url("' + _WG_ART + 'event-plate.png") center/100% 100% no-repeat;}' +
            // 🚨內文區與頁籤軌都用「相對外殼的 % 絕對定位」,不要用 px padding 排:
            //   底板是 background-size:100% 100% 拉伸的圖,白板塊的邊界固定在某個百分比上,
            //   px padding 一遇到面板改尺寸就跟底板脫節(標題/選項/身分卡欄位整組跑歪)。
            //   同時這也是「版位微調」拖得動它們的前提——flex 排的東西沒有可拖的四邊。
            '.wg-ev-head{position:absolute;left:24.8%;top:5%;right:4%;bottom:85.4%;}' +
            '.wg-ev-text{position:absolute;left:24.8%;top:17%;right:3.9%;bottom:74.5%;overflow-y:auto;}' +
            '.wg-ev-main{position:absolute;left:12.9%;top:27.9%;right:3.6%;bottom:10.1%;overflow-y:auto;scrollbar-width:thin;}' +
            '.wg-ev-meta{display:flex;align-items:center;gap:9px;font-size:11px;letter-spacing:3px;font-weight:700;color:var(--party-muted);}' +
            '.wg-ev-meta b{color:var(--npc-accent);font-size:14px;letter-spacing:1px;}' +
            '.wg-ev-meta::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(201,170,114,.7),rgba(201,170,114,0));}' +
            '.wg-ev-title{margin-top:8px;font-size:clamp(21px,3.4vh,34px);font-weight:900;letter-spacing:3px;line-height:1.25;color:#14243d;}' +
            // 灰字不得再降淡：這面板以前就是被淡灰小字弄成催眠表單的
            '.wg-ev-prompt{font-size:15px;line-height:1.62;color:#3d4f68;}' +
            // 標題那組(meta/大標/題幹)跟選項要看得出是兩段:貼太近會讀成一整塊,分不清哪裡是「該我做決定」了。
            //   選項也不能拉滿寬——桌機事件殼有六成螢幕寬,整條橫過去像表格列不像按鈕,而且眼睛要從編號掃很遠才到文字。
            '.wg-choices{display:flex;flex-direction:column;gap:9px;}' +
            '.wg-choice{display:flex;align-items:center;gap:15px;width:100%;text-align:left;cursor:pointer;min-height:58px;padding:11px 18px;' +
              'border:1px solid rgba(20,36,61,.15);background:rgba(255,255,255,.92);color:#14243d;transition:.16s;' +
              'clip-path:polygon(0 0,100% 0,calc(100% - 16px) 100%,0 100%);}' +
            '.wg-choice-i{flex:none;min-width:52px;font-family:Georgia,"Times New Roman",serif;font-size:31px;font-weight:900;line-height:1;color:#14243d;}' +
            '.wg-choice-t{flex:1;min-width:0;font-size:15px;font-weight:700;line-height:1.5;padding-left:15px;border-left:1px solid rgba(20,36,61,.2);}' +
            '.wg-choice:hover,.wg-choice:focus-visible{background:var(--party-navy);border-color:var(--party-navy);color:#fff;outline:none;}' +
            '.wg-choice:hover .wg-choice-i,.wg-choice:focus-visible .wg-choice-i{color:var(--npc-accent);}' +
            '.wg-choice:hover .wg-choice-t,.wg-choice:focus-visible .wg-choice-t{border-left-color:rgba(255,255,255,.32);}' +
            
            '.wg-prof-row{display:flex;gap:12px;padding:9px 2px;border-bottom:1px dashed rgba(20,36,61,.14);}.wg-prof-row:last-child{border-bottom:none;}' +
            '.wg-prof-row span{flex:none;width:64px;color:var(--party-muted);font-size:12px;font-weight:700;padding-top:2px;}' +
            '.wg-prof-row b{color:#22334c;font-weight:600;line-height:1.6;font-size:14px;}' +
            // 頁籤軌是整條斜切金邊的墨藍條(獨立素材);左右尖端是造型,按鈕靠 padding 讓開不要壓上去
            // 用 top/bottom 定高、不用 height:四邊都是可拖的量,微調模式吐出來的 CSS 才貼得回來
            //   (同時設 height 跟 top+bottom 會打架,height 贏、bottom 被忽略)
            '.wg-tabs{position:absolute;left:0.2%;right:26.1%;top:93%;bottom:-0.3%;display:flex;padding:0 4%;' +
              'background:url("' + _WG_ART + 'tab-rail.png") center/100% 100% no-repeat;}' +
            '.wg-tab{position:relative;flex:1;padding:13px 4px;background:none;border:none;cursor:pointer;' +
              'color:rgba(233,240,250,.7);font-size:14px;font-weight:700;letter-spacing:3px;font-family:inherit;}' +
            '.wg-tab+.wg-tab{border-left:1px solid rgba(201,170,114,.5);}' +
            '.wg-tab:hover{color:#fff;}.wg-tab.on{color:#fff;}' +
            '.wg-tab.on::after{content:"";position:absolute;left:28%;right:28%;bottom:7px;height:2px;background:var(--npc-accent);}' +
            // 手機:上下堆疊,海報收成角色橫幅;字級一律不縮(縮了就變回催眠表單)
            '@media (max-width:760px){.wg-win{right:10px;left:10px;width:auto;max-width:none;max-height:76%;}' +
              '.wg-meet{flex-direction:column;}' +
              // 手機換另一張底板:桌機那張是 2:3 直式，攤成橫幅會整個變形。這張是專門的角色舞台，
              //   底部中央有發光平台＝人站的位置，左側墨藍楔形＝放代號牌的地方。
              // 用面板的百分比而不是 vh:這塊是面板內的元件,vh 量的是整個視窗、跟面板高度不是同一回事
              '.wg-poster{flex:0 0 38%;}' +
              '.wg-poster-plane{background-image:url("' + _WG_ART + 'mobile-stage.png");}' +
              // 兩張底板各自帶透明邊,並排會看成「兩張紙」→ 讓事件板往上壓一點,接成一體
              '.wg-shell{margin-top:-3%;}' +
              '.wg-poster-fig{left:24%;right:24%;top:6%;bottom:9%;}' +
              // 手機的巨大姓名要收在墨藍楔形上緣以內:壓下去的話藍色描邊落在深底上會整個消失
              '.wg-poster-name{font-size:clamp(24px,10vw,40px);left:6%;top:3%;}' +
              // 代號牌留在右側白區(跟桌機同一側):挪到左邊的墨藍楔形上會跟巨大姓名疊在一起,
              //   而且深字疊深底還得整組改色——右側白區兩個問題都不存在。
              '.wg-poster-sig{bottom:36%;}' +
              '.wg-ev-head{left:4%;right:4%;top:4%;bottom:82%;}' +
              '.wg-ev-text{left:4%;right:4%;top:18%;bottom:70%;}' +
              '.wg-ev-main{left:4%;right:4%;top:30%;bottom:16%;}' +
              '.wg-tabs{top:84%;}' +
              '.wg-brand-copy small{display:none}' +
              '.void-dock-open #iris-avatar{opacity:.22;filter:brightness(.55) blur(1px);transition:opacity .25s;}}';
        doc.head.appendChild(st);
    }

    let _winEl = null;
    let _seeds = [];        // 本次抽出的種子(暫存,不落盤)
    let _busy = false;
    function _toast(msg) {
        try { win.toastr?.info(msg, '🌌 世界門'); } catch (e) {}
        console.log('[Worldgate③]', msg);
    }
    function closeGate() {
        _winEl?.remove(); _winEl = null;
        try { win.document.querySelector('.lobby-left')?.classList.remove('void-dock-open'); } catch (e) {}
    }
    async function openGate() {
        closeGate();
        _mgrOff();   // 每次開窗都從乾淨的檔案庫開始
        // 開窗順手把燈號校正回來（手動開過藍燈、或換世界時忘了關掉舊的，都在這裡自動修正；沒歪就不寫）
        _getCurrentId().then(id => _syncWorldLamps(id)).catch(() => {});
        // 🩺 體檢：條目掉了自己補回來；沒掛在這張卡上只記下來，由列表頁提示（不自動改別人的角色卡）
        _healthCheck().then(r => {
            _health = r;
            if (r.fixed) _toast('世界檔案少了 ' + r.fixed + ' 份，已經補回來');
            if (_winEl && !_curDetailId) { try { _renderList(); } catch (e) {} }
        }).catch(() => {});
        _closeMeet();   // 右側停靠位互斥:開世界門先收組隊卡
        const doc = win.document;
        _ensureStyle(doc);
        const host = doc.querySelector('.lobby-left') || doc.body;
        host.classList.add('void-dock-open');
        const box = doc.createElement('div');
        box.className = 'wg-win';
        box.innerHTML =
            '<div class="wg-head">' +
              '<div class="wg-brand"><span class="wg-brand-icon"><i class="fa-solid fa-globe"></i></span>' +
                '<span class="wg-brand-copy"><b>世界門</b><small>WORLD GATE PLAZA</small></span></div>' +
              '<span class="wg-mode-pill" data-wg-mode><i class="fa-solid fa-city"></i> 主世界</span></div>' +
            '<div class="wg-body"></div>';
        host.appendChild(box);
        _winEl = box;
        _refreshModePill();
        _renderList();
    }
    function _refreshModePill() {
        if (!_winEl) return;
        const pill = _winEl.querySelector('[data-wg-mode]');
        if (!pill) return;
        const inPara = !!_gate()?.isInParallax?.();
        pill.classList.toggle('para', inPara);
        pill.innerHTML = inPara
            ? '<i class="fa-solid fa-bolt"></i> 視差進行中'
            : '<i class="fa-solid fa-city"></i> 主世界';
    }
    function _body() { return _winEl ? _winEl.querySelector('.wg-body') : null; }
    function _loading(text) {
        const b = _body();
        if (b) b.innerHTML = '<div class="wg-loading"><div class="wg-spinner"></div><span>' + text + '</span></div>';
    }

    // ── P1 世界檔案庫 ──
    // 管理模式:一次刪好幾個世界。原本只能一張一張點進詳情頁刪,清舊世界要進出好幾趟。
    let _health = null;               // 最近一次體檢結果 { fixed, linked }
    let _mgr = false;                 // 檔案庫是否在管理(勾選)模式
    let _bulkArm = 0;                 // 批次刪除的兩段式確認(同詳情頁那顆的做法)
    const _selIds = new Set();        // 已勾選的世界 id
    function _mgrOff() { _mgr = false; _bulkArm = 0; _selIds.clear(); }
    async function _renderList() {
        const b = _body(); if (!b) return;
        _curDetailId = null;
        const worlds = await _get(K_WORLDS, []);
        if (!worlds.length) _mgrOff();   // 空檔案庫沒東西可管
        _selIds.forEach(id => { if (!worlds.some(w => w.id === id)) _selIds.delete(id); });   // 別留已被刪掉的殘影
        const inPara = !!_gate()?.isInParallax?.();
        const allOn = worlds.length > 0 && _selIds.size === worlds.length;
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-book-atlas"></i> 世界檔案庫</span>' +
              '<span class="wg-head-acts">' +
                (_mgr
                    ? '<span class="wg-section-note">已選 ' + _selIds.size + ' 個</span>' +
                      '<button class="wg-mgr-btn" data-act="mgr-all">' + (allOn ? '取消全選' : '全選') + '</button>'
                    : '<span class="wg-section-note">' + worlds.length + ' 個世界</span>' +
                      (worlds.length ? '<button class="wg-mgr-btn" data-act="mgr"><i class="fa-solid fa-list-check"></i> 管理</button>' : '')) +
              '</span></div>' +
            // 🩺 書在、條目也在，但沒掛到這張角色卡上＝面板看得到世界，故事裡的主持AI卻讀不到。
            //   不自動掛：大廳在別人的卡裡也開得起來，自動掛等於把視差世界書塞進別人的角色卡。
            (_health && _health.linked === false
                ? '<div class="wg-warn"><i class="fa-solid fa-triangle-exclamation"></i>' +
                  '<span>這張角色卡沒有掛上世界檔案庫。你可以照常挑世界，但進去之後主持故事的 AI 讀不到世界設定。</span>' +
                  '<button class="wg-mgr-btn" data-act="link">掛上去</button></div>'
                : '') +
            (worlds.length
                ? worlds.map(w =>
                    '<div class="wg-card ' + (_mgr ? 'click pick' + (_selIds.has(w.id) ? ' sel' : '') : 'click') + '" data-id="' + w.id + '">' +
                      '<div class="wg-card-title"><i class="fa-solid ' +
                        (_mgr ? (_selIds.has(w.id) ? 'fa-square-check' : 'fa-square') : 'fa-earth-asia') + '"></i> ' + _esc(w.name) +
                        '<span class="wg-visits">進入 ' + (w.visits || 0) + ' 次</span></div>' +
                      '<div class="wg-card-sub">' + _esc(w.concept) + '</div>' +
                      '<div class="wg-tags"><span class="wg-tag">' + _esc(w.style) + '</span>' +
                        '<span class="wg-tag">' + _esc(w.lure) + '</span>' +
                        '<span class="wg-tag warn">' + _esc(w.danger) + '</span></div>' +
                    '</div>').join('')
                : '<div class="wg-empty"><i class="fa-solid fa-globe"></i>檔案庫還是空的。<br>請愛麗絲為你調出新的世界。</div>') +
            (_mgr
                ? '<div class="wg-btn-row">' +
                    '<button class="wg-btn ghost" data-act="mgr-done">完成</button>' +
                    '<button class="wg-btn danger" data-act="bulk-del"' + (_selIds.size ? '' : ' disabled') + '>' +
                      '<i class="fa-solid fa-trash-can"></i> ' +
                      (_bulkArm ? '再按一次確認刪除' : '刪除選取的 ' + _selIds.size + ' 個') + '</button>' +
                  '</div>'
                : '<button class="wg-btn" data-act="draw"><i class="fa-solid fa-dice"></i> 請愛麗絲調出新世界</button>' +
                  '<div class="wg-note">調出新世界會呼叫 AI(抽選+展開共兩次);重進已有世界不呼叫。</div>') +
            (inPara ? '<button class="wg-btn danger" data-act="leave"><i class="fa-solid fa-door-open"></i> 撤離視差,返回主世界</button>' : '');
        b.querySelectorAll('.wg-card.click').forEach(el => el.addEventListener('click', async () => {
            if (_mgr) {   // 管理模式下點卡片=勾選,不進詳情
                const id = el.dataset.id;
                if (_selIds.has(id)) _selIds.delete(id); else _selIds.add(id);
                _bulkArm = 0;   // 勾選有變動→確認要重按,免得改完選擇按下去刪到不是想刪的那批
                _renderList();
                return;
            }
            const worlds2 = await _get(K_WORLDS, []);
            const w = worlds2.find(x => x.id === el.dataset.id);
            if (w) _renderDetail(w);
        }));
        b.querySelector('[data-act="mgr"]')?.addEventListener('click', () => { _mgr = true; _bulkArm = 0; _selIds.clear(); _renderList(); });
        b.querySelector('[data-act="mgr-done"]')?.addEventListener('click', () => { _mgrOff(); _renderList(); });
        b.querySelector('[data-act="mgr-all"]')?.addEventListener('click', () => {
            _bulkArm = 0;
            if (allOn) _selIds.clear(); else worlds.forEach(w => _selIds.add(w.id));
            _renderList();
        });
        b.querySelector('[data-act="bulk-del"]')?.addEventListener('click', async () => {
            if (!_selIds.size) return;
            if (_bulkArm === 0) { _bulkArm = 1; _renderList(); return; }
            const hit = worlds.filter(w => _selIds.has(w.id));
            _loading('正在收回這些世界…');
            await _deleteWorlds(hit);
            _toast('已從檔案庫移除 ' + hit.length + ' 個世界');
            _mgrOff();
            _renderList();
        });
        b.querySelector('[data-act="link"]')?.addEventListener('click', async (ev) => {
            ev.currentTarget.disabled = true;
            const ok = await _linkBook();
            _toast(ok ? '已經掛上去了' : '掛不上去，請在角色卡的世界書設定裡手動加上 ' + BOOK_PARA);
            if (ok) { _health = await _healthCheck(); await _syncWorldLamps(await _getCurrentId()); }
            _renderList();
        });
        b.querySelector('[data-act="draw"]')?.addEventListener('click', _renderSeedPage);
        b.querySelector('[data-act="leave"]')?.addEventListener('click', async () => {
            const r = await _gate()?.exitParallax?.();
            await _setCurrentId('');   // 回主世界＝不再屬於任何異世界，模組條目跟著切回大廳那組
            await _syncWorldLamps('');   // 世界條目全部關掉，免得回到主世界還在吃異世界設定
            try { window.WORLD_RULES && window.WORLD_RULES.sync('撤離'); } catch (e) {}
            _toast(r?.msg || '已返回主世界');
            _refreshModePill(); _renderList();
        });
    }

    // ── P2 種子抽選 ──
    async function _renderSeedPage() {
        const b = _body(); if (!b) return;
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-dice"></i> 世界種子</span><span class="wg-section-note">此頁功能會呼叫 AI</span></div>' +
            '<div class="wg-empty" data-wg-seedhint><i class="fa-solid fa-wand-magic-sparkles"></i>填了題材,四顆種子都會是那個題材,<br>留空就讓愛麗絲隨手抽一把。</div>' +
            // 30 字連一句完整的題材都寫不完(實測「…挖掘海洋世界的秘」就是在第 30 字被切掉的)
            '<textarea class="wg-input area" data-wg-hint maxlength="300" rows="2" placeholder="想玩的題材/氛圍(可留空)"></textarea>' +
            '<div class="wg-btn-row">' +
              '<button class="wg-btn ghost" data-act="back">返回</button>' +
              '<button class="wg-btn" data-act="roll"><i class="fa-solid fa-dice"></i> 抽世界種子</button>' +
            '</div>';
        b.querySelector('[data-act="back"]').addEventListener('click', _renderList);
        b.querySelector('[data-act="roll"]').addEventListener('click', () => _rollSeeds());
        if (_seeds.length) _renderSeedCards();   // 上次抽的還在就直接顯示(不重燒)
    }
    async function _rollSeeds() {
        if (_busy) return;
        _busy = true;
        const hint = _body()?.querySelector('[data-wg-hint]')?.value?.trim() || '';
        _loading('愛麗絲正在調閱世界庫…');
        _seeds = await _drawSeeds(hint);
        _busy = false;
        if (!_seeds.length) {
            const b = _body(); if (!b) return;
            _renderSeedPage();
            const hintEl = b.querySelector('[data-wg-seedhint]');
            if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>世界庫沒有回應,請再試一次。';
            return;
        }
        _renderSeedCards();
    }
    function _renderSeedCards() {
        const b = _body(); if (!b) return;
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-dice"></i> 選一個世界展開</span><span class="wg-section-note">' + _seeds.length + ' 顆種子</span></div>' +
            _seeds.map((s, i) =>
                '<div class="wg-card click" data-i="' + i + '">' +
                  '<div class="wg-card-title"><i class="fa-solid fa-seedling"></i> ' + _esc(s.name) + '</div>' +
                  '<div class="wg-card-sub">' + _esc(s.concept) + '</div>' +
                  (s.twist ? '<div class="wg-card-sub"><i class="fa-solid fa-scale-unbalanced"></i> ' + _esc(s.twist) + '</div>' : '') +
                  // 規則落到日常＝這張卡才像一個「地方」而不是一句謎語
                  (s.daily ? '<div class="wg-card-sub"><i class="fa-solid fa-person-walking"></i> ' + _esc(s.daily) + '</div>' : '') +
                  '<div class="wg-card-sub">' + _esc(s.crisis || '') + '</div>' +
                  '<div class="wg-tags">' + (s.type ? '<span class="wg-tag">' + _esc(s.type) + '</span>' : '') +
                    '<span class="wg-tag">' + _esc(s.style) + '</span>' +
                    '<span class="wg-tag">' + _esc(s.lure) + '</span>' +
                    '<span class="wg-tag warn">' + _esc(s.danger) + '</span></div>' +
                '</div>').join('') +
            // 單行 input 加 120 字上限太緊,一個想法都寫不完;改成可換行、可拉高的多行輸入
            '<textarea class="wg-input area" data-wg-note maxlength="500" rows="3" placeholder="想加進這個世界的東西(可留空)"></textarea>' +
            '<div class="wg-btn-row">' +
              '<button class="wg-btn ghost" data-act="back">返回</button>' +
              '<button class="wg-btn ghost" data-act="reroll"><i class="fa-solid fa-rotate-right"></i> 重抽一把</button>' +
            '</div>' +
            '<div class="wg-note">先填上面那格再點種子,展開時會照著加進去。點選種子後會展開成完整世界並存進檔案庫(呼叫一次 AI)。</div>';
        b.querySelector('[data-act="back"]').addEventListener('click', _renderSeedPage);
        b.querySelector('[data-act="reroll"]').addEventListener('click', () => { _seeds = []; _renderSeedPage(); });
        b.querySelectorAll('.wg-card.click').forEach(el => el.addEventListener('click', () => {
            // 備註要在 innerHTML 被 _loading 洗掉之前先讀出來
            _pickSeed(Number(el.dataset.i), b.querySelector('[data-wg-note]')?.value?.trim() || '');
        }));
    }
    async function _pickSeed(i, note) {
        if (_busy) return;
        const seed = _seeds[i];
        if (!seed) return;
        _busy = true;
        note = String(note || '').trim();
        _loading('正在建構「' + _esc(seed.name) + '」的世界檔案…');
        const r = await _expandWorldText(seed, note);
        if (!r || !r.text) { _busy = false; _toast('世界建構失敗,請重試'); _renderSeedCards(); return; }
        _loading('正在召集前往「' + _esc(seed.name) + '」的旅人…');
        // 旅人與面板兩支並行:各自只吃世界檔案節錄、彼此不相干,牆鐘時間等於慢的那一支。
        // 連接設定是逐次隨請求帶的(不是切全域),兩支同時在跑不會互相踩。
        // 面板或成就掛了就當這個世界沒有那一項,不能連累旅人與世界存檔。
        const [trav, panel, achv] = await Promise.all([
            _expandTravelers(seed, r.text, note),
            _expandPanel(seed, r.text).catch(e => { console.warn('[Worldgate③] 面板生成失敗', e); return null; }),
            _expandAchv(seed, r.text).catch(e => { console.warn('[Worldgate③] 成就生成失敗', e); return null; }),
        ]);
        _busy = false;
        const w = {
            id: _mkId(), name: seed.name, concept: seed.concept, twist: seed.twist || '', style: seed.style,
            genre: seed.genre || '', type: seed.type || '',   // 基調要留著:重新召集旅人時得跟著帶,不然新旅人會跟世界不同調
            lure: seed.lure, danger: seed.danger, crisis: seed.crisis,
            keys: r.keys.map(String),
            entryText: r.text,      // 世界檔案原文(不含頁首/旅人區塊)——重新召集旅人時要拿它重組條目
            note: note,             // 展開時的追加要求——重新召集旅人時要跟著帶,不然新旅人會不符合當初的設定
            spawns: r.spawns || [], // 可選的降生地(展開時同一次 API 順便帶回來的,不另外呼叫)
            spawn: '',              // 玩家選的那個(空=交給主持AI自己安排,維持舊行為)
            artPrompt: r.artPrompt || '', mapPrompt: r.mapPrompt || '',   // 兩張圖的關鍵詞,同一次 API 順便帶回來的
            art: '', mapArt: '',    // 圖在世界存好之後才在背景生,不擋畫面
            travelers: _normTravelers(trav),
            panel: panel || null,   // 🎴 VN 劇情末尾那一頁的外觀;null=沒生成到,末尾退回原本那幾顆鍵
            achv: achv || null,     // 🏅 這個世界的成就清單;解鎖仍走既有的成就標記,這裡只是清單
            visits: 0, ts: Date.now(),
        };
        const wrote = await _writeEntry(w, r.text);
        if (!wrote) { _toast('世界條目寫入失敗(確認已匯入' + BOOK_PARA + ')'); _renderSeedCards(); return; }
        if (!w.travelers.length) _toast('世界已建好,但旅人沒召集到——詳情頁可重新召集');
        const worlds = await _get(K_WORLDS, []);
        worlds.unshift(w);
        await _set(K_WORLDS, worlds);
        _seeds = [];
        _toast('「' + w.name + '」已存入檔案庫');
        _renderDetail(w);
        _fillArt(w);   // 不 await:兩張圖在背景慢慢生,好了會自己寫回檔案庫並重繪
    }

    // ── P4 隊友身分卡(面板內第二層頁) ──
    function _renderProfilePage(w, ti) {
        const b = _body(); if (!b) return;
        const t = w.travelers && w.travelers[ti];
        if (!t) return;
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-id-card"></i> ' + _esc(t.name) + '</span>' +
              '<span class="wg-section-note">' + (t.recruited ? '已入隊' : '旅人') + '・' + _esc(t.job || '') + '</span></div>' +
            '<div class="wg-card">' + _profRows(t) + '</div>' +
            '<button class="wg-btn ghost" data-act="back">返回</button>';
        b.querySelector('[data-act="back"]').addEventListener('click', () => _renderDetail(w));
    }

    // ── 🧍 出發編成槽位 ──
    const _WG_ART = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/worldgate_ui/';
    const SLOT_BACK  = _WG_ART + 'party-slot-back.png';
    const SLOT_FRONT = _WG_ART + 'party-slot-front.png';
    // 職業→菱石圖示。旅人的 job 是「普通人在做的工作」的自由文字,對不上就回預設的人形,
    //   不為了這顆裝飾去要模型多吐一個欄位(多一條規格就多一個它會照字面辦事的地方)。
    const JOB_ICONS = [
        [/醫|療|護|藥|診|治/, 'fa-heart-pulse'], [/廚|料理|烘|焙|餐|咖啡|酒保|麵/, 'fa-utensils'],
        [/修|工程|技師|機械|水電|木匠|師傅/, 'fa-screwdriver-wrench'], [/教|學|研究|老師|講師|圖書|編輯|作家/, 'fa-book'],
        [/警|衛|兵|獵|保全|傭/, 'fa-shield-halved'], [/商|販|店|業務|會計|櫃/, 'fa-store'],
        [/畫|樂|唱|舞|演|藝|設計|攝影/, 'fa-palette'], [/農|園|花|漁|牧|林/, 'fa-seedling'],
        [/司機|運|快遞|物流|送|船/, 'fa-truck-fast'], [/程式|電腦|網路|工程師|資料/, 'fa-microchip'],
    ];
    function _jobIcon(job) {
        const s = String(job || '');
        const hit = JOB_ICONS.find(p => p[0].test(s));
        return hit ? hit[1] : 'fa-user';
    }
    // 旅人的圖＝大廳小人皮膚(自動補圖存的那張,key=wg_世界_索引)。沒生過就維持剪影。
    //   資料在 localStorage(lobby_stage_skins_v1),不需要人在大廳場景裡也讀得到。
    //   槽位與組隊海報共用這一條,兩邊看到的一定是同一張圖。
    async function _figureOf(worldId, i) {
        const b = _stage();
        if (!b || !b.skins || !b.resolveRef) return null;
        let all = {};
        try { all = b.skins() || {}; } catch (e) { return null; }
        const sk = all['wg_' + worldId + '_' + i];
        if (!sk || !sk.ref) return null;
        try {
            const src = await b.resolveRef(sk.ref);
            return src ? { src: src, sheet: sk.kind === 'sheet' } : null;
        } catch (e) { return null; }
    }
    async function _slotFigures(w) {
        const out = {};
        for (let i = 0; i < MAX_TRAVELER_SPAWN; i++) {
            const f = await _figureOf(w.id, i);
            if (f) out[i] = f;
        }
        return out;
    }
    // 角色色只用在小面積強調(編號/頁籤底線)。固定挑一組跟量子白+墨藍搭得起來的冷色,
    //   不用 hash 直接生 hue——會抽到跟系統色打架的濁黃濁綠。
    const NPC_ACCENTS = ['#35c9e8', '#4f8cf0', '#7a6cf0', '#3fb98f', '#e0894a', '#dd6079'];
    function _accentOf(name) {
        let h = 0;
        const s = String(name || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return NPC_ACCENTS[h % NPC_ACCENTS.length];
    }
    function _slotsHtml(team) {
        const cells = [];
        for (let s = 0; s < MAX_TRAVELER_SPAWN; s++) {
            const x = team[s];
            if (x) {
                cells.push(
                    '<div class="wg-slot on" data-i="' + x.i + '">' +
                      '<div class="wg-slot-shell">' +
                        '<img class="wg-slot-back" src="' + SLOT_BACK + '" alt="">' +
                        '<div class="wg-slot-fig" data-fig="' + x.i + '"></div>' +
                        '<img class="wg-slot-front" src="' + SLOT_FRONT + '" alt="">' +
                        '<span class="wg-slot-gem"><i class="fa-solid ' + _jobIcon(x.t.job) + '"></i></span>' +
                        '<span class="wg-slot-check"><i class="fa-solid fa-circle-check"></i></span>' +
                      '</div>' +
                      '<span class="wg-slot-name">' + _esc(x.t.name) + '</span>' +
                      '<span class="wg-slot-job"><i class="fa-solid ' + _jobIcon(x.t.job) + '"></i>' + _esc(x.t.job || '') + '</span>' +
                    '</div>');
            } else {
                cells.push(
                    '<div class="wg-slot empty" data-empty="1">' +
                      '<div class="wg-slot-shell">' +
                        '<img class="wg-slot-back" src="' + SLOT_BACK + '" alt="">' +
                        '<span class="wg-slot-ghost"><i class="fa-solid fa-user-plus"></i></span>' +
                        '<img class="wg-slot-front" src="' + SLOT_FRONT + '" alt="">' +
                      '</div>' +
                      '<span class="wg-slot-name">邀請成員</span>' +
                      '<span class="wg-slot-job"><i class="fa-solid fa-user"></i>自由選擇</span>' +
                    '</div>');
            }
        }
        return '<div class="wg-slots">' + cells.join('') + '</div>';
    }

    // ── P3 世界詳情(隊伍狀態+DIVE) ──
    let _delArm = 0;   // 刪除兩段式確認(不用 window.confirm,Tauri 會攔)
    let _curDetailId = null;   // 面板當前顯示的世界(偶遇入隊時用來即時刷新隊伍區)
    async function _renderDetail(w) {
        const b = _body(); if (!b) return;
        _delArm = 0;
        _mgrOff();   // 離開檔案庫=管理模式歸零,回來時不會還停在勾選狀態
        _curDetailId = w.id;
        if (await _salvageWorld(w)) _fillArt(w);   // 🩹 那四行沒被認出來的舊世界:補回欄位後順手把圖補生
        let entryText = '';
        try {
            const entries = await _th()?.getLorebookEntries?.(BOOK_PARA);
            const e = (entries || []).find(x => x.comment === _entryComment(w));
            entryText = e ? e.content : '';
        } catch (e) {}
        // 隊伍區只列「確認組隊」的旅人;候選不露臉——他們在大廳裡等妳偶遇(Rae 定案 2026-07-22)
        const team = (w.travelers || []).map((t, i) => ({ t, i })).filter(x => x.t.recruited);
        const figs = await _slotFigures(w);
        // 概念句與三顆標籤壓在概念圖上(不再自己佔一張卡)；沒有概念圖時退回原本的文字卡
        const tagsHtml = '<div class="wg-tags">' +
            '<span class="wg-tag"><i class="fa-solid fa-wand-magic-sparkles"></i>' + _esc(w.style) + '</span>' +
            '<span class="wg-tag lure"><i class="fa-solid fa-gem"></i>' + _esc(w.lure) + '</span>' +
            '<span class="wg-tag warn"><i class="fa-solid fa-triangle-exclamation"></i>' + _esc(w.danger) + '</span></div>';
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-earth-asia"></i> ' + _esc(w.name) + '</span><span class="wg-section-note">進入 ' + (w.visits || 0) + ' 次</span></div>' +
            (w.art
                ? '<div class="wg-art"><img src="' + _esc(w.art) + '" alt="">' +
                    '<div class="wg-art-ov"><div class="wg-art-concept">' + _esc(w.concept) + '</div>' + tagsHtml + '</div></div>'
                : '<div class="wg-card"><div class="wg-card-sub">' + _esc(w.concept) + '</div>' + tagsHtml + '</div>') +
            (entryText ? '<div class="wg-card"><div class="wg-entry-text">' + _esc(_corePreview(entryText)) + '</div></div>' : '') +
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-users"></i> 出發編成</span><span class="wg-section-note">' + team.length + ' / ' + MAX_TRAVELER_SPAWN + '</span></div>' +
            _slotsHtml(team) +
            ((w.travelers || []).length ? '' : '<button class="wg-btn ghost" data-act="regen-trav"><i class="fa-solid fa-user-plus"></i> 重新召集旅人</button>') +
            // 面板是後來才加的功能:舊世界一律沒有,這裡補一顆給它們;已經有的話這顆就是「換一個樣子」
            '<button class="wg-btn ghost" data-act="regen-panel"><i class="fa-solid fa-palette"></i> ' +
              (w.panel ? '換一個結束畫面' : '做這個世界的結束畫面') + '</button>' +
            // 成就也是後來才加的:舊世界一律沒有,這顆補給它們
            '<button class="wg-btn ghost" data-act="regen-achv"><i class="fa-solid fa-medal"></i> ' +
              (w.achv ? '重擬這個世界的成就' : '設計這個世界的成就') + '</button>' +
            _spawnHtml(w, entryText) +
            // 🎭 玩家在這個世界要當什麼。不做選單:每個世界的職業與種族體系都不一樣,
            //   給清單等於把它變成題庫,而且清單外的東西就填不了。自由填寫最不設限。
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-user-pen"></i> 我的身分</span>' +
              '<span class="wg-section-note">' + (w.pc ? '已指定' : '沒填＝由主持AI安排') + '</span></div>' +
            '<textarea class="wg-input area" data-wg-pc maxlength="200" rows="2" ' +
              'placeholder="想當什麼、長什麼樣(可留空)">' + _esc(w.pc || '') + '</textarea>' +
            '<button class="wg-btn" data-act="dive"><i class="fa-solid fa-bolt"></i> DIVE·進入世界</button>' +
            '<div class="wg-btn-row">' +
              '<button class="wg-btn ghost" data-act="back">返回</button>' +
              '<button class="wg-btn danger" data-act="del"><i class="fa-solid fa-trash-can"></i> 刪除世界</button>' +
            '</div>';
        b.querySelectorAll('.wg-slot.on').forEach(el => el.addEventListener('click', () => {
            _renderProfilePage(w, Number(el.dataset.i));   // 面板內第二層頁,不彈modal
        }));
        // 空槽不放說明文字(身分卡在偶遇窗裡已經有一份)——點下去才講怎麼補人
        b.querySelectorAll('.wg-slot.empty').forEach(el => el.addEventListener('click', () => {
            _toast('旅人在純白大廳等你搭話,聊得投機才會答應同行');
        }));
        // 小人皮膚是動態網址(IDB blob/dataURL),只能在這裡掛成 CSS 變數(HTML 字串裡不寫 style)
        b.querySelectorAll('[data-fig]').forEach(el => {
            const f = figs[Number(el.dataset.fig)];
            if (!f) return;
            el.style.setProperty('--wg-fig', 'url("' + f.src + '")');
            if (f.sheet) el.classList.add('sheet');
        });
        // 方位圖是動態網址,只能在這裡掛成 CSS 變數(HTML 字串裡不寫 style)
        if (w.mapArt) {
            const mg = b.querySelector('[data-spawn-grid]');
            if (mg) mg.style.setProperty('--wg-map', 'url("' + w.mapArt + '")');
        }
        // 降生地:純前端切換,選好存進世界資料;再點一次同一個=取消(交回主持AI安排)
        b.querySelectorAll('.wg-spawn').forEach(el => el.addEventListener('click', async () => {
            const nm = el.dataset.n || '';
            w.spawn = (w.spawn === nm) ? '' : nm;
            await _saveWorld(w);
            b.querySelectorAll('.wg-spawn').forEach(x => x.classList.toggle('on', !!w.spawn && x.dataset.n === w.spawn));
            const tip = b.querySelector('[data-spawn-tip]');
            if (tip) tip.textContent = w.spawn ? ('降生地：' + w.spawn) : '沒選＝落在哪由主持AI安排';
        }));
        // 🎴 結束畫面:舊世界沒有、生成失敗也沒有,這裡補一次;已經有的話就是重抽一個風格重做
        b.querySelector('[data-act="regen-panel"]')?.addEventListener('click', async () => {
            if (_busy) return;
            _busy = true;
            _loading('正在佈置「' + _esc(w.name) + '」的結束畫面…');
            const panel = await _expandPanel(
                { name: w.name, genre: w.genre, style: w.style, concept: w.concept },
                w.entryText || entryText || w.concept || w.name,
            ).catch(() => null);
            _busy = false;
            if (!panel) { _toast('結束畫面沒做出來,再試一次'); _renderDetail(w); return; }
            w.panel = panel;
            await _saveWorld(w);
            _toast('結束畫面已換上,下次劇情演完就看得到');
            _renderDetail(w);
        });
        // 🏅 成就清單:舊世界沒有、生成失敗也沒有。重擬之後條目要跟著更新,主持AI 才看得到新的那份
        b.querySelector('[data-act="regen-achv"]')?.addEventListener('click', async () => {
            if (_busy) return;
            _busy = true;
            _loading('正在擬定「' + _esc(w.name) + '」的成就…');
            const achv = await _expandAchv(
                { name: w.name, genre: w.genre, type: w.type, style: w.style, concept: w.concept },
                w.entryText || entryText || w.concept || w.name,
            ).catch(() => null);
            _busy = false;
            if (!achv) { _toast('成就沒擬出來,再試一次'); _renderDetail(w); return; }
            w.achv = achv;
            await _saveWorld(w);
            if (w.entryText) await _writeEntry(w, w.entryText);
            _toast('成就已寫進這個世界');
            _renderDetail(w);
        });
        // 世界檔案與旅人是分兩次生的:旅人那次掛掉時世界照樣存下來,這裡補一次(沒有旅人=偶遇組隊整條路都走不了)
        b.querySelector('[data-act="regen-trav"]')?.addEventListener('click', async () => {
            if (_busy) return;
            _busy = true;
            _loading('正在召集前往「' + _esc(w.name) + '」的旅人…');
            const trav = await _expandTravelers(
                { name: w.name, genre: w.genre, type: w.type, style: w.style, concept: w.concept, twist: w.twist },
                w.entryText || entryText || w.concept || w.name,
                w.note || '');   // 當初展開時的追加要求要跟著帶,不然重召的旅人會跟這個世界對不上
            _busy = false;
            if (!trav.length) { _toast('旅人召集失敗,請再試一次'); _renderDetail(w); return; }
            w.travelers = _normTravelers(trav);
            await _saveWorld(w);
            if (w.entryText) await _writeEntry(w, w.entryText);   // 條目裡的旅人區塊一起更新
            _toast('旅人已上線大廳');
            _renderDetail(w);
        });
        _spawnTravelers(w);   // 點開世界=旅人自動陸續上線(非大廳場景時靜默跳過)
        b.querySelector('[data-act="dive"]').addEventListener('click', async () => {
            if (_busy) return;
            _busy = true;
            // 身分要在按下去這刻收:她可能填完直接按 DIVE，沒有離開輸入框的動作
            const _pc = (b.querySelector('[data-wg-pc]')?.value || '').trim().slice(0, 200);
            if (_pc !== (w.pc || '')) { w.pc = _pc; await _saveWorld(w); }
            _loading('正在同步量子行李…');
            const r = await _dive(w);
            _busy = false;
            _toast(r.msg);
            if (r.ok) { _refreshModePill(); closeGate(); }
            else _renderDetail(w);
        });
        b.querySelector('[data-act="back"]').addEventListener('click', _renderList);
        b.querySelector('[data-act="del"]').addEventListener('click', async (ev) => {
            if (_delArm === 0) {
                _delArm = 1;
                ev.currentTarget.innerHTML = '<i class="fa-solid fa-trash-can"></i> 再按一次確認刪除';
                return;
            }
            await _deleteWorlds([w]);
            _toast('「' + w.name + '」已從檔案庫移除');
            _renderList();
        });
    }

    // 這個聊天室現在在哪個世界（沒 DIVE 過就是 null）。
    // 🚨給煉丹爐/UI 生成那些工具型呼叫用:它們原本靠酒館的世界書觸發拿世界觀,
    //   但視差的世界全部擠在同一本【奧瑞亞-視差】裡當條目,工具型呼叫沒有劇情文字去觸發關鍵字
    //   → 一條都沒進來、世界觀整個是空的。所以要能直接把當前世界問出來,不繞世界書。
    async function getCurrentWorld() {
        try {
            const id = await _getCurrentId();
            if (!id) return null;
            const worlds = await _get(K_WORLDS, []);
            const w = worlds.find(x => x.id === id);
            if (!w) return null;
            return {
                id: w.id, name: w.name, genre: w.genre || '', type: w.type || '', style: w.style || '',
                concept: w.concept || '', lure: w.lure || '', danger: w.danger || '', spawn: w.spawn || '',
                entryText: w.entryText || '',
            };
        } catch (e) { return null; }
    }

    // 🎴 給 VN 劇情末尾的活動面板用。刻意跟 getCurrentWorld 分開兩支:
    //   那支的回傳會被組進工具型呼叫的 prompt,面板的 html/css 有好幾 KB、底圖還是 dataURL,
    //   混進去等於每支工具呼叫都多背一份面板原始碼。這支只給前端渲染用,不進任何 prompt。
    async function getWorldPanel() {
        try {
            const id = await _getCurrentId();
            if (!id) return null;
            const worlds = await _get(K_WORLDS, []);
            const w = worlds.find(x => x.id === id);
            if (!w) return null;
            return {
                id: w.id, name: w.name, concept: w.concept || '', style: w.style || '',
                panel: w.panel || null,          // {html,css,styleId,layoutId} — 面板外觀
                achv: w.achv || null,            // 這個世界的成就清單
                achvDone: w.achvDone || null,    // {成就名:達成時間}——名字對得上清單的那幾條
                launchArt: w.launchArt || null,  // {teamKey,url} — 這趟隊伍的啟航群像
                art: w.art || '',                // 退路底圖:世界概念圖(無人遠景)
            };
        } catch (e) { return null; }
    }

    win.OS_WORLDGATE = window.OS_WORLDGATE = { openGate, closeGate, closeMeet: _closeMeet, getCurrentWorld, getWorldPanel };
    console.log('[Worldgate③] 世界門面板就緒');
})();
