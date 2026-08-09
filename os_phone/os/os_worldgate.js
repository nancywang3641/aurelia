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
    const BOOK_PARA = '【奧瑞亞-視差】';
    const MAX_TRAVELER_SPAWN = 4;

    function _db() { return win.OS_DB || window.OS_DB; }
    async function _get(k, dflt) {
        try { const db = _db(); if (!db?.getAppData) return dflt; const v = await db.getAppData(APP_ID, k); return (v === undefined || v === null) ? dflt : v; }
        catch (e) { return dflt; }
    }
    async function _set(k, v) {
        try { const db = _db(); if (!db?.saveAppData) return; await db.saveAppData(APP_ID, k, v); } catch (e) { console.warn('[Worldgate③] 存檔失敗', k, e); }
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
    // 🚨模型常常寫著寫著就從思考鏈滑進正文,忘了補結束標籤。成對比對配不到、單邊那條又只刪標籤不刪內容,
    //   那幾千字草稿就整包留在正文裡:①吃掉輸出額度,正文寫不完就斷 ②截斷續寫時又被當「已寫好的部分」餵回去。
    //   孤兒開標籤要從它自己砍到正文的第一個分節標題;找不到標題就整段不動,寧可留著也不能把正文砍光。
    function _dropOrphanTag(t, tag) {
        const open = new RegExp('<' + tag + '[^>]*>', 'i');
        let m;
        while ((m = t.match(open))) {
            const rest = t.slice(m.index + m[0].length);
            const h = rest.search(/\n#{1,6}[ 　]/);
            if (h < 0) break;
            t = t.slice(0, m.index) + rest.slice(h);
        }
        return t;
    }
    function _cleanModelOutput(s) {
        let t = String(s == null ? '' : s);
        ['thinking', 'think', 'draft', 'branches', 'disclaimer', 'reasoning', 'plan'].forEach(tag => {
            t = t.replace(new RegExp('<' + tag + '[^>]*>[\\s\\S]*?<\\/' + tag + '>', 'gi'), '');
            t = _dropOrphanTag(t, tag);                                      // 有開無閉:連內容一起砍
            t = t.replace(new RegExp('<\\/?' + tag + '[^>]*>', 'gi'), '');   // 只剩單邊標籤也清掉
        });
        const cm = t.match(/<content>([\s\S]*?)<\/content>/i);   // 有包 <content> 就只取裡面
        if (cm) t = cm[1];
        return t.replace(/<!--[\s\S]*?-->/g, '')                 // <!-- {} --> 這種殘留
                .replace(/\n{3,}/g, '\n\n').trim();
    }
    // 白名單制:只收模型放進 <worldfile> 的那一段。比逐一剝掉附加模組穩——剝除是黑名單,
    //   漏掉一種標籤(或那個標籤沒閉合)就整包污染;取標籤內則是不管外面包了什麼都拿得到正文。
    // 標籤名不用通用字眼,避免跟角色卡自己的區塊撞名。
    const _WF_TAG = 'worldfile';
    // 🚨開標籤取最後一個:思考鏈會先把這個標籤名唸過一遍,取第一個等於連草稿一起收進來。
    // 🚨沒有結束標籤照樣要收(那正是被截斷的情況),收到結尾就對了,續寫那支會接上去。
    // 模型沒照做(整份沒有標籤)就原樣回傳,交給剝除那條路處理,行為跟以前一樣。
    function _pickBlock(s) {
        const t = String(s == null ? '' : s);
        const open = new RegExp('<' + _WF_TAG + '[^>]*>', 'gi');
        let m, at = -1, len = 0;
        while ((m = open.exec(t))) { at = m.index; len = m[0].length; }
        if (at < 0) return t;
        const rest = t.slice(at + len);
        const end = rest.search(new RegExp('<\\/' + _WF_TAG + '\\s*>', 'i'));
        return end < 0 ? rest : rest.slice(0, end);
    }
    // asText=true:世界檔案正文近三千字,包進 JSON 字串太容易被引號/換行搞爆 parse → 直接收 markdown 純文字
    async function _callAI(prompt, label, route, useMain, asText) {
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
            config = config || {};
            config.route = route;
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label, keepCodeFences: true });
            });
            return asText ? _stripFences(raw) : _extractJSON(raw);
        } catch (e) { console.warn('[Worldgate③] ' + label + ' 失敗', e); return null; }
    }

    // ── 種子抽選(1次API→4顆種子;hint=玩家偏好詞可空) ──
    async function _drawSeeds(hint) {
        const prompt =
            '你是一位資深的跑團世界觀設計師,替玩家設計可以長期生活、探索的異世界。請生成 4 顆世界種子。只回傳純 JSON 陣列:\n' +
            '[{"genre":"{題材類型,不超過8字,例如:劍與魔法/仙俠修真/神話史詩/海洋與深淵/蒸汽工業/民俗怪談}","type":"{基調,不超過6字}","name":"{世界名,不超過8字,有記憶點}","concept":"{一句話概念,不超過25字}","twist":"{一條違反常識的核心規則,不超過45字}","daily":"{這條規則讓當地人每天實際在做什麼,不超過25字}","style":"{視覺風格,不超過10字}","lure":"{玩家前往的理由/可獲得什麼,不超過20字}","danger":"{主要危險,不超過15字}","crisis":"{這個世界現在正在發生、玩家會撞上的事,不超過20字}"}]\n' +
            // 🚨type 一樣不給清單(理由同下面 twist 那段)。只講它是哪一個維度、以及四顆要拉開。
            '【基調 type】type 跟 genre 是兩件事:genre 是題材,type 是玩家住進去會過什麼樣的日子、故事讀起來是什麼味道。不要把題材再寫一次當 type。\n' +
            '4 顆種子的 type 必須明顯不同,而且**不是每個世界都要背著沉重的使命或世界級危機**——至少要有一顆是低風險、可以慢慢過日子的走向。\n' +
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
        '## 二、世界地圖\n先用一段話交代區域之間的相對位置與通行關係(誰接壤誰、走過去要多久、路上會遇到什麼),再逐一寫入口區與另外 2~3 個區域,每區都要有:名稱 / 類型(降生地、城市、荒野、邊境、禁區) / 樣貌與環境 / 由誰控制 / 能取得什麼物資 / 能做什麼 / 主要危險 / 通往哪些區域 / 移動需要的條件或代價。要讓人看得出「從哪裡能走去哪裡」,不是幾個漂浮的地名。\n' +
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
            // 🚨整份包進標籤是為了跟角色卡自己的附加模組(思考鏈/草稿/免責聲明)隔開:程式只收標籤裡面那一段。
            //   沒有這道隔離的話,模型的思考鏈草稿會被當成世界正文,還會吃掉輸出額度害正文寫不完。
            '【輸出格式】整份世界檔案要寫在 <' + _WF_TAG + '> 與 </' + _WF_TAG + '> 之間,標籤外不要有任何內容,' +
            '結尾那兩行給程式讀的資料也要寫在標籤裡面。標籤裡直接輸出檔案正文,用下列標題分節,不要 JSON、不要程式碼區塊、不要開場白或結語。' +
            '總長 1800~2600 字,十節依序寫完,每節都要有實質內容,不准只留標題或用一句話帶過。\n' +
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
            '寧可少一個區域,不可少掉價格、循環與常識。\n' +
            // 🚨玩家的追加要求放最後:放前面的話後面隔著兩千多字規格才輪到下筆,權重被稀釋到等於沒寫。
            _noteLine(note) +
            // 關鍵字與降生地都是「結尾單行」給程式吃的：同一次呼叫帶回來、不另外燒 API，也不用在正文裡塞 JSON。
            // 🚨兩行必須綁成同一個收尾區塊。分開寫、各自標「只輸出這一行」的話，模型吐完第一行就當任務結束，
            //   第二行永遠是被漏掉的那個（實測：十節九千多字全寫完、關鍵字有、降生地整行不存在）。
            '全部寫完後,最後補上兩行給程式讀的資料,兩行都必須有、缺一不可、順序如下:\n' +
            '第一行 關鍵字:世界名、其他2~4個本世界專有名詞(頓號分隔,不要加任何其他文字)\n' +
            '第二行 降生地:名稱|方位|一句話 / 名稱|方位|一句話 / …(給 3~4 個,斜線分隔;方位只能是 北/南/東/西/東北/東南/西北/西南/中央 其中一個;' +
            '這些是第二節寫過的區域裡,適合玩家第一次落地的地方,各自感覺要明顯不同;一句話寫「在這裡開場會看到什麼」,不超過20字)\n' +
            '寫完 </' + _WF_TAG + '> 就停,標籤外不要再補任何說明。語言:繁體中文。';
        let text = _cleanModelOutput(_pickBlock(await _callAI(prompt, '世界門展開世界', 'worldgate_expand', true, true)));
        if (!text) return null;
        // 截斷保險:尾巴那節沒寫到就接著補完(整份重生太貴,也會換一套設定)
        // 🚨判斷一定要在「清乾淨之後」的文字上做,而且別綁節名——節名改過一次(冒險引擎→自己在轉的事),
        //    舊字串比對不到就會每次都誤判成截斷、白白多燒一次主模型。
        if (!/關鍵字[:：]|降生地[:：]/.test(text.slice(-800))) {
            console.warn('[Worldgate③] 世界檔案疑似被截斷,續寫補完');
            const more = await _callAI(
                '以下是一份寫到一半的跑團世界檔案。請直接接著往下寫完剩下的段落,不要重複已經寫過的內容,不要開場白或結語,不要重寫標題以外的舊段落。' +
                '補寫的內容要寫在 <' + _WF_TAG + '> 與 </' + _WF_TAG + '> 之間,標籤外不要有任何內容。' +
                '完整節次如下(缺哪節補哪節):\n' + _WORLD_SECTIONS +
                '全部寫完後,最後補上兩行給程式讀的資料,兩行都必須有、缺一不可、順序如下:\n' +
                '第一行 關鍵字:世界名、其他2~4個本世界專有名詞(頓號分隔)\n' +
                '第二行 降生地:名稱|方位|一句話 / …(給 3~4 個,斜線分隔;方位只能是 北/南/東/西/東北/東南/西北/西南/中央 其中一個)\n' +
                _genreLine(seed) + '語言:繁體中文。\n\n【已寫好的部分】\n' + text,
                '世界門續寫檔案', 'worldgate_expand', true, true);
            if (more) text += '\n' + _cleanModelOutput(_pickBlock(more));
        }
        const km = text.match(/關鍵字[:：]\s*(.+)/);
        const keys = km ? km[1].split(/[、,，\/]+/).map(s => s.trim()).filter(Boolean).slice(0, 5) : [];
        if (km) text = text.replace(km[0], '').trim();   // 關鍵字行是給程式吃的,不留在正文裡
        if (!keys.length || keys[0] !== seed.name) keys.unshift(seed.name);
        // 降生地：同樣是「結尾單行」給程式吃的，解析完就從正文剝掉（留著會被當劇情念出來）
        const sm = text.match(/降生地[:：]\s*(.+)/);
        const spawns = sm ? _parseSpawns(sm[1]) : [];
        if (sm) text = text.replace(sm[0], '').trim();
        return { text, keys: keys.slice(0, 5), spawns };
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
               '<div class="wg-spawn-grid">' + cells.join('') + '</div>';
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
            '"sprite":"{這個人的外觀,英文逗號分隔的關鍵詞,只寫看得見的東西:性別年齡體型/髮色髮型/瞳色/服裝與配件/隨身物,大約10~16個詞;不要背景、不要姿勢、不要畫風或畫質詞}",' +
            '"quiz":[{"q":"{他用來考驗對方合不合拍的問題或話題}","options":[{"t":"{回應選項}","good":{true或false},"r":"{他對此回應的反應一句}"}]}],' +
            '"accept":"{三題都滿意時的入隊台詞1~2句}","refuse":"{不滿意時的婉拒台詞一句}"}]}\n' +
            '每位旅人 quiz 固定 3 題、每題 options 固定 3 個且恰好 1 個 good=true;good 選項不是討好或客套話,而是最對上這個人性格與在意之處的回應,要靠理解他才選得中,錯誤選項也要看起來合理。\n' +
            // 🚨只餵前段:旅人要的是世界長怎樣、社會怎麼運作,用不到正史/核心人物/事件鉤子。
            //   整份塞回去會讓這支的輸入暴增(實測破萬字),輸出額度被擠掉 → JSON 被截斷 → 召集失敗。
            '【世界檔案(節錄)】\n' + _briefWorld(worldText) + '\n' +
            '語言:繁體中文。';
        const r = await _callAI(prompt, '世界門召集旅人', 'worldgate_expand', true);
        const arr = Array.isArray(r) ? r : (r && Array.isArray(r.travelers) ? r.travelers : []);
        return arr.filter(t => t && t.name);
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

    // ── 世界條目落地【奧瑞亞-視差】書 ──
    function _entryComment(w) { return '【世界檔案-' + w.name + '】'; }
    function _entryContent(w, entryText) {
        // 🚨只寫「真的入隊」的旅人：條目是持久的、隊伍是每趟都可能不同的,兩者本來就不同層。
        //   寫進全部候選的話,玩家單人進去時主持AI仍收到四份旅人檔案→沒招募的人自己走進劇情;
        //   留在大廳的人的弱點/翻臉條件也等於白白劇透。隊伍在按下 DIVE 那刻定案(之後就清場),
        //   所以 _dive 會在注入開場指令前重寫一次條目。
        // 旅人區塊帶上目標/弱點/翻臉條件——這是給主持AI看的底牌,玩家在身分卡上看不到這幾欄
        const trav = (w.travelers || []).filter(t => t && t.recruited)
            .map(t => '- ' + t.name + '(' + t.job + '):' + t.persona + ' ' + t.origin +
            (t.skill ? ';擅長' + t.skill : '') + (t.fit ? ';與這個世界的關係:' + t.fit : '') +
            (t.goal ? ';個人目標:' + t.goal : '') + (t.weakness ? ';弱點:' + t.weakness : '') +
            (t.clash ? ';容易起衝突於:' + t.clash : '') + (t.breakup ? ';離隊或翻臉的條件:' + t.breakup : '')).join('\n');
        return '# 視差世界檔案:' + w.name + '\n' +
            '一句話:' + w.concept + '(' + (w.genre ? '題材:' + w.genre + ' ' : '') + '風格:' + w.style + ')\n' +
            (w.genre ? '本世界的一切描寫都必須維持在「' + w.genre + '」的題材裡,不得混入不屬於此題材的科技或現代說法。\n' : '') +
            (w.twist ? '核心法則:' + w.twist + '\n' : '') + '\n' + entryText +
            (trav ? '\n\n## 這趟同行的旅人(視差玩家,非本世界NPC)\n' + trav : '');
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
    async function _deleteEntry(w) {
        const TH = _th();
        if (!TH || !TH.updateLorebookEntriesWith) return;
        try { await TH.updateLorebookEntriesWith(BOOK_PARA, list => list.filter(e => e.comment !== _entryComment(w))); }
        catch (e) { console.warn('[Worldgate③] 世界條目刪除失敗', e); }
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
                const ok = await LD.genSpriteInto(key, t.sprite, { src: cfg.src, preset: preset });
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
    let _meetEl = null, _lobbyRegDone = false;
    function _closeMeet() { _meetEl?.remove(); _meetEl = null; }
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
            let backTo = null;   // 身分卡頁的返回目標=進來前所在頁
            const head = (back) =>
                '<div class="wg-meet-head">' +
                  (back ? '<button class="wg-back" data-m="back"><i class="fa-solid fa-chevron-left"></i></button>' : '') +
                  '<span class="wg-meet-name"><i class="fa-solid fa-user"></i> ' + _esc(t.name) + '<small>' + _esc(t.job || '') + '</small>' +
                  (t.recruited ? '<i class="wg-joined"><i class="fa-solid fa-circle-check"></i> 已入隊</i>' : '') + '</span></div>';
            const wire = () => {
                box.querySelector('[data-m="prof"]')?.addEventListener('click', renderProfile);
            };
            const renderProfile = () => {   // 卡內第二層頁:‹返回切回組隊頁,不疊modal
                box.innerHTML = head(true) + '<div class="wg-meet-body">' + _profRows(t) + '</div>';
                box.querySelector('[data-m="back"]').addEventListener('click', () => (backTo || renderIntro)());
            };
            async function joinTeam() {
                t.recruited = true;
                await _saveWorld(w);
                try { if (t.accept) win.LobbyStage.pushNpcHistory(npcKey, { role: 'assistant', content: t.accept }); } catch (e) {}   // 入隊宣言入他的記憶(考題過程不入)
                _toast(t.name + ' 加入了隊伍');
                if (_winEl && _curDetailId === w.id) _renderDetail(w);   // 面板正開著這個世界→隊伍狀態即時刷新
            }
            const renderIntro = () => {
                // 對話本體在底部對話框(開場白已seed成預設對話,打字=自由聊);這張卡只管組隊
                backTo = renderIntro;
                box.innerHTML = head() +
                    '<div class="wg-meet-body">' +
                      (t.persona ? '<div class="wg-note">' + _esc(t.persona) + '</div>' : '') +
                      (t.recruited
                          ? '<div class="wg-note"><i class="fa-solid fa-circle-check"></i> 已經是你的隊友,世界門面板可以看到隊伍狀態。</div>'
                          : (quiz.length ? '<div class="wg-note">想邀他同行?先聊得來再說。</div>' : '')) +
                    '</div>' +
                    '<div class="wg-meet-btns">' +
                      (!t.recruited ? (quiz.length
                          ? '<button class="wg-btn" data-m="quiz"><i class="fa-solid fa-handshake"></i> 聊聊組隊的事</button>'
                          : '<button class="wg-btn" data-m="join"><i class="fa-solid fa-handshake"></i> 邀請入隊</button>') : '') +
                      '<button class="wg-btn ghost" data-m="prof"><i class="fa-solid fa-id-card"></i> 身分卡</button>' +
                    '</div>';
                wire();
                box.querySelector('[data-m="quiz"]')?.addEventListener('click', () => { step = 0; goods = 0; renderQuiz(); });
                box.querySelector('[data-m="join"]')?.addEventListener('click', async () => { await joinTeam(); renderResult(true, ''); });   // 舊世界資料沒考題→直接邀
            };
            const renderQuiz = () => {
                const q = quiz[step];
                _sayInDialog(q.q);   // 他的提問=底部對話框說出來
                const order = q.options.map((_, i) => i);
                for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }   // 洗選項順序,防AI把好答案固定放第一個
                box.innerHTML = head() +
                    '<div class="wg-meet-body">' +
                      '<div class="wg-note">第 ' + (step + 1) + ' / ' + quiz.length + ' 題・他在等你的回應</div>' +
                      '<div class="wg-opts">' + order.map(i => '<button class="wg-opt" data-i="' + i + '">' + _esc(q.options[i].t) + '</button>').join('') + '</div>' +
                    '</div>';
                wire();
                box.querySelectorAll('.wg-opt').forEach(el => el.addEventListener('click', () => {
                    const o = q.options[Number(el.dataset.i)];
                    if (o && o.good) goods++;
                    renderReact(o);
                }));
            };
            const renderReact = (o) => {
                const last = step >= quiz.length - 1;
                _sayInDialog((o && o.r) || '……');   // 他的反應也走對話框
                box.innerHTML = head() +
                    '<div class="wg-meet-btns"><button class="wg-btn" data-m="next">' + (last ? '看他的決定' : '下一題') + '</button></div>';
                wire();
                box.querySelector('[data-m="next"]').addEventListener('click', async () => {
                    if (last) {
                        const ok = goods >= quiz.length;   // 三題全滿意才入隊(Rae 定案)
                        if (ok) await joinTeam();
                        renderResult(ok, ok ? t.accept : t.refuse);
                    } else { step++; renderQuiz(); }
                });
            };
            const renderResult = (ok, line) => {
                backTo = () => renderResult(ok, line);
                _sayInDialog(line || (ok ? '(他答應同行了。)' : '(他搖了搖頭,婉拒了。)'));
                box.innerHTML = head() +
                    '<div class="wg-meet-body">' +
                      '<div class="wg-note">' + (ok ? '<i class="fa-solid fa-circle-check"></i> 已入隊——世界門面板可以看到隊伍狀態。' : '頻率沒對上……待會可以再聊一次。') + '</div>' +
                    '</div>' +
                    '<div class="wg-meet-btns">' +
                      (ok ? '<button class="wg-btn ghost" data-m="prof"><i class="fa-solid fa-id-card"></i> 身分卡</button>'
                          : '<button class="wg-btn" data-m="retry"><i class="fa-solid fa-rotate-right"></i> 再聊一次</button>') +
                    '</div>';
                wire();
                box.querySelector('[data-m="retry"]')?.addEventListener('click', () => { step = 0; goods = 0; renderQuiz(); });
            };
            if (startAtProfile) { backTo = renderIntro; renderProfile(); }
            else renderIntro();
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
    function _divePrompt(w) {
        const team = (w.travelers || []).filter(t => t.recruited);
        const teamStr = team.length
            ? team.map(t => '- ' + t.name + '(' + t.job + '):' + t.persona + ';擅長' + t.skill).join('\n')
            : '(單人行動)';
        return '🌌 NEXUS PARALLAX · 世界啟動\n' +
            '━━━━━━━━━━━━━━━━━━━━━\n' +
            '[System:玩家從純白大廳進入視差世界「' + w.name + '」]\n' +
            '世界概念:' + w.concept + '(' + (w.genre ? '題材:' + w.genre + ' ' : '') + '風格:' + w.style + ')\n' +
            '同行旅人:\n' + teamStr + '\n' +
            (w.spawn ? '降生地:' + w.spawn + '(玩家指定,開場就從這裡起)\n' : '') + '\n' +
            '【指令】\n' +
            // 開場就是她看到「兩腳獸在海底游」的地方——身體轉化要在這裡當場發生,不能等世界檔案裡寫過就算數
            '0. 玩家與同行旅人都是從奧瑞亞進來的人類,抵達時會依這個世界的法則被改造成能在這裡生存的形態(世界檔案第三節寫的那個)。' +
            '開場必須寫出他們發現自己身體變了的那一刻,之後全篇都用改造後的身體描寫他們——不要讓人類身體靠裝備在這個世界裡通行。\n' +
            '1. 以「' + w.name + '」的世界檔案為準,從' + (w.spawn ? '「' + w.spawn + '」' : '入口區域') + '開場,描寫玩家(與同行旅人)抵達時的所見所感。' +
            (w.genre ? '全篇用「' + w.genre + '」的語彙書寫,不得混入不屬於此題材的科技或現代說法。' : '') + '\n' +
            '2. 遵循視差跑團主持規範:不強推主線、只描述可感知資訊、事件制推進。' +
            '世界檔案裡的法則與危機是這個地方的背景質地,不是玩家的任務——不要拿它當開場鉤子逼玩家表態或選邊,玩家要在這裡做生意、找人、閒晃都可以。\n' +
            '3. 開場結尾給出眼前可見的幾個方向或機會,然後停下等待玩家行動。\n' +
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
        _clearTravelers(); _closeMeet();
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
            '.wg-back{background:none;border:none;color:#4a4e66;cursor:pointer;font-size:15px;padding:4px 9px;border-radius:8px;flex:none;}.wg-back:hover{background:rgba(26,28,40,.08);}' +
            '.wg-body{overflow-y:auto;padding:11px 13px 14px;flex:1;display:flex;flex-direction:column;scrollbar-color:rgba(26,28,40,.25) transparent;scrollbar-width:thin;}' +
            '.wg-empty{margin:auto;color:#8a8ea6;padding:24px 6px;text-align:center;line-height:1.8;}.wg-empty i{display:block;margin-bottom:8px;color:#b9bed4;font-size:28px;}' +
            '.wg-section-head{display:flex;align-items:center;justify-content:space-between;margin:0 1px 8px;color:#3a3e56;}.wg-section-title{font-weight:800;font-size:13px;letter-spacing:.04em;}.wg-section-note{color:#8a8ea6;font-size:10px;}' +
            '.wg-card{margin-bottom:8px;padding:10px 12px;border:1px solid rgba(26,28,40,.13);border-radius:12px;background:rgba(255,255,255,.72);box-shadow:0 2px 7px rgba(26,28,40,.05);}' +
            '.wg-card.click{cursor:pointer;transition:transform .15s,background .15s,border-color .15s;}.wg-card.click:hover{transform:translateY(-1px);background:#fff;border-color:rgba(26,28,40,.3);}' +
            '.wg-card.sel{border-color:#1A1C28;box-shadow:0 0 0 1px #1A1C28;background:#fff;}' +
            '.wg-card-title{display:flex;align-items:center;gap:6px;font-weight:800;color:#22263c;}.wg-card-title .wg-visits{margin-left:auto;color:#8a8ea6;font-size:9px;font-weight:700;white-space:nowrap;}' +
            '.wg-card-sub{color:#5a5e75;font-size:11px;margin-top:3px;line-height:1.5;}' +
            '.wg-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;}.wg-tag{padding:1px 6px;border-radius:9px;background:rgba(26,28,40,.06);color:#5a5e75;font-size:9px;border:1px solid rgba(26,28,40,.08);}' +
            '.wg-tag.warn{background:rgba(180,80,60,.08);color:#a05040;border-color:rgba(180,80,60,.2);}' +
            // 降生地九宮格：純 CSS 排方位，不生任何圖
            '.wg-spawn-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:4px;}' +
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
            '.wg-trav{display:flex;align-items:center;gap:9px;margin-bottom:6px;padding:8px 10px;border:1px solid rgba(26,28,40,.12);border-radius:10px;background:rgba(255,255,255,.65);cursor:pointer;transition:.15s;}' +
            '.wg-trav:hover{background:#fff;}.wg-trav.on{border-color:#1A1C28;background:#fff;box-shadow:0 0 0 1px #1A1C28;}' +
            '.wg-trav-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(26,28,40,.07);color:#3a3e56;font-size:13px;flex:none;}' +
            '.wg-trav-main{min-width:0;flex:1;}.wg-trav-name{font-weight:800;color:#22263c;font-size:12px;}.wg-trav-name small{color:#8a8ea6;font-weight:700;font-size:9px;margin-left:5px;}' +
            '.wg-trav-sub{color:#5a5e75;font-size:10px;margin-top:2px;line-height:1.45;}' +
            '.wg-trav-check{color:#1A1C28;font-weight:900;font-size:13px;}' +
            '.wg-entry-text{color:#3a3e56;font-size:11px;line-height:1.7;white-space:pre-wrap;}' +
            /* 🤝 組隊卡/身分卡:右側停靠(同愛麗絲世界門/瀅瀅書咖成例);對話本體在底部對話框 */
            '.wg-meet{position:absolute;right:max(2.2%,calc(50% - 410px));top:50%;transform:translateY(-50%);z-index:3355;width:340px;max-width:52%;max-height:78%;overflow-y:auto;display:flex;flex-direction:column;background:linear-gradient(rgba(250,251,255,.98),rgba(238,240,246,.98));border:1px solid rgba(26,28,40,.18);border-radius:14px;color:#1A1C28;font-size:12px;box-shadow:0 12px 34px rgba(26,28,40,.32);backdrop-filter:blur(8px);scrollbar-width:thin;}' +
            '.wg-meet-head{display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom:1px solid rgba(26,28,40,.1);background:rgba(255,255,255,.6);position:sticky;top:0;}' +
            '.wg-meet-name{display:flex;align-items:center;gap:6px;font-weight:800;min-width:0;}.wg-meet-name small{color:#8a8ea6;font-weight:700;font-size:9px;}' +
            '.wg-joined{display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:2px 7px;border-radius:8px;background:rgba(60,120,80,.12);color:#3c6b44;font-size:9px;font-style:normal;font-weight:800;white-space:nowrap;}' +
            '.wg-meet-body{padding:11px 12px 4px;display:flex;flex-direction:column;gap:8px;}' +
            '.wg-say{padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.78);border:1px solid rgba(26,28,40,.1);color:#2a2e44;line-height:1.65;}' +
            '.wg-opts{display:flex;flex-direction:column;gap:6px;}' +
            '.wg-opt{text-align:left;background:rgba(255,255,255,.62);border:1px solid rgba(26,28,40,.16);color:#3a3e56;border-radius:9px;padding:8px 10px;cursor:pointer;font-size:11px;line-height:1.5;transition:.15s;}.wg-opt:hover{background:#fff;border-color:rgba(26,28,40,.4);}' +
            '.wg-meet-btns{padding:0 12px 12px;display:flex;flex-direction:column;}' +
            '.wg-prof-row{display:flex;gap:8px;padding:6px 2px;border-bottom:1px dashed rgba(26,28,40,.1);}.wg-prof-row:last-child{border-bottom:none;}.wg-prof-row span{flex:none;width:44px;color:#8a8ea6;font-size:10px;font-weight:700;padding-top:1px;}.wg-prof-row b{color:#2a2e44;font-weight:600;line-height:1.55;font-size:11px;}' +
            '@media (max-width:760px){.wg-win{right:10px;left:10px;width:auto;max-width:none;max-height:76%;}.wg-meet{right:10px;left:10px;width:auto;max-width:none;max-height:66%;}.wg-brand-copy small{display:none}.void-dock-open #iris-avatar{opacity:.22;filter:brightness(.55) blur(1px);transition:opacity .25s;}}';
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
    async function _renderList() {
        const b = _body(); if (!b) return;
        _curDetailId = null;
        const worlds = await _get(K_WORLDS, []);
        const inPara = !!_gate()?.isInParallax?.();
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-book-atlas"></i> 世界檔案庫</span><span class="wg-section-note">' + worlds.length + ' 個世界</span></div>' +
            (worlds.length
                ? worlds.map(w =>
                    '<div class="wg-card click" data-id="' + w.id + '">' +
                      '<div class="wg-card-title"><i class="fa-solid fa-earth-asia"></i> ' + _esc(w.name) +
                        '<span class="wg-visits">進入 ' + (w.visits || 0) + ' 次</span></div>' +
                      '<div class="wg-card-sub">' + _esc(w.concept) + '</div>' +
                      '<div class="wg-tags"><span class="wg-tag">' + _esc(w.style) + '</span>' +
                        '<span class="wg-tag">' + _esc(w.lure) + '</span>' +
                        '<span class="wg-tag warn">' + _esc(w.danger) + '</span></div>' +
                    '</div>').join('')
                : '<div class="wg-empty"><i class="fa-solid fa-globe"></i>檔案庫還是空的。<br>請愛麗絲為你調出新的世界。</div>') +
            '<button class="wg-btn" data-act="draw"><i class="fa-solid fa-dice"></i> 請愛麗絲調出新世界</button>' +
            '<div class="wg-note">調出新世界會呼叫 AI(抽選+展開共兩次);重進已有世界不呼叫。</div>' +
            (inPara ? '<button class="wg-btn danger" data-act="leave"><i class="fa-solid fa-door-open"></i> 撤離視差,返回主世界</button>' : '');
        b.querySelectorAll('.wg-card.click').forEach(el => el.addEventListener('click', async () => {
            const worlds2 = await _get(K_WORLDS, []);
            const w = worlds2.find(x => x.id === el.dataset.id);
            if (w) _renderDetail(w);
        }));
        b.querySelector('[data-act="draw"]')?.addEventListener('click', _renderSeedPage);
        b.querySelector('[data-act="leave"]')?.addEventListener('click', async () => {
            const r = await _gate()?.exitParallax?.();
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
            '<input class="wg-input" data-wg-hint maxlength="30" placeholder="想玩的題材/氛圍(可留空)">' +
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
            '<input class="wg-input" data-wg-note maxlength="120" placeholder="想加進這個世界的東西(可留空)">' +
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
        const trav = await _expandTravelers(seed, r.text, note);
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
            travelers: _normTravelers(trav),
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

    // ── P3 世界詳情(隊伍狀態+DIVE) ──
    let _delArm = 0;   // 刪除兩段式確認(不用 window.confirm,Tauri 會攔)
    let _curDetailId = null;   // 面板當前顯示的世界(偶遇入隊時用來即時刷新隊伍區)
    async function _renderDetail(w) {
        const b = _body(); if (!b) return;
        _delArm = 0;
        _curDetailId = w.id;
        let entryText = '';
        try {
            const entries = await _th()?.getLorebookEntries?.(BOOK_PARA);
            const e = (entries || []).find(x => x.comment === _entryComment(w));
            entryText = e ? e.content : '';
        } catch (e) {}
        // 隊伍區只列「確認組隊」的旅人;候選不露臉——他們在大廳裡等妳偶遇(Rae 定案 2026-07-22)
        const team = (w.travelers || []).map((t, i) => ({ t, i })).filter(x => x.t.recruited);
        const travHtml = team.map(x =>
            '<div class="wg-trav on" data-i="' + x.i + '">' +
              '<span class="wg-trav-avatar"><i class="fa-solid fa-user"></i></span>' +
              '<span class="wg-trav-main"><span class="wg-trav-name">' + _esc(x.t.name) + '<small>' + _esc(x.t.job) + '</small></span>' +
                '<span class="wg-trav-sub">' + _esc(x.t.skill || x.t.persona) + '</span></span>' +
              '<span class="wg-trav-check"><i class="fa-solid fa-circle-check"></i></span>' +
            '</div>').join('');
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-earth-asia"></i> ' + _esc(w.name) + '</span><span class="wg-section-note">進入 ' + (w.visits || 0) + ' 次</span></div>' +
            '<div class="wg-card"><div class="wg-card-sub">' + _esc(w.concept) + '</div>' +
              '<div class="wg-tags"><span class="wg-tag">' + _esc(w.style) + '</span><span class="wg-tag">' + _esc(w.lure) + '</span><span class="wg-tag warn">' + _esc(w.danger) + '</span></div></div>' +
            (entryText ? '<div class="wg-card"><div class="wg-entry-text">' + _esc(entryText.length > 600 ? entryText.slice(0, 600) + '…' : entryText) + '</div></div>' : '') +
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-users"></i> 隊伍</span><span class="wg-section-note">' + team.length + ' 人同行・點開看身分卡</span></div>' +
            (travHtml || '<div class="wg-note"><i class="fa-solid fa-person-walking"></i> 還沒有隊友——旅人們已陸續上線大廳,走過去搭話,聊得投機才會答應同行。(小人也可以右鍵看身分卡)</div>') +
            ((w.travelers || []).length ? '' : '<button class="wg-btn ghost" data-act="regen-trav"><i class="fa-solid fa-user-plus"></i> 重新召集旅人</button>') +
            _spawnHtml(w, entryText) +
            '<button class="wg-btn" data-act="dive"><i class="fa-solid fa-bolt"></i> DIVE·進入世界</button>' +
            '<div class="wg-btn-row">' +
              '<button class="wg-btn ghost" data-act="back">返回</button>' +
              '<button class="wg-btn danger" data-act="del"><i class="fa-solid fa-trash-can"></i> 刪除世界</button>' +
            '</div>';
        b.querySelectorAll('.wg-trav').forEach(el => el.addEventListener('click', () => {
            _renderProfilePage(w, Number(el.dataset.i));   // 面板內第二層頁,不彈modal
        }));
        // 降生地:純前端切換,選好存進世界資料;再點一次同一個=取消(交回主持AI安排)
        b.querySelectorAll('.wg-spawn').forEach(el => el.addEventListener('click', async () => {
            const nm = el.dataset.n || '';
            w.spawn = (w.spawn === nm) ? '' : nm;
            await _saveWorld(w);
            b.querySelectorAll('.wg-spawn').forEach(x => x.classList.toggle('on', !!w.spawn && x.dataset.n === w.spawn));
            const tip = b.querySelector('[data-spawn-tip]');
            if (tip) tip.textContent = w.spawn ? ('降生地：' + w.spawn) : '沒選＝落在哪由主持AI安排';
        }));
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
            await _deleteEntry(w);
            const worlds = await _get(K_WORLDS, []);
            await _set(K_WORLDS, worlds.filter(x => x.id !== w.id));
            _clearTravelers(); _closeMeet();
            try { for (let i = 0; i < MAX_TRAVELER_SPAWN; i++) win.localStorage.removeItem('lstage_hist_wg_' + w.id + '_' + i); } catch (e) {}   // 旅人對話歷史一起清,不留孤兒
            _toast('「' + w.name + '」已從檔案庫移除');
            _renderList();
        });
    }

    win.OS_WORLDGATE = window.OS_WORLDGATE = { openGate, closeGate, closeMeet: _closeMeet };
    console.log('[Worldgate③] 世界門面板就緒');
})();
