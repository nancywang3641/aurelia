// ----------------------------------------------------------------
// [檔案] os_tarot.js（占卜引擎）
// 路徑：os_phone/os/os_tarot.js
// 職責：塔羅的牌、牌陣、牌義、解牌與追問（叫模型那段）。
//   11-26 起不畫畫面：個人占卜搬進紫薇的記憶吧檯（core/void/lobby_memory.js「問問自己的事」），舊的賽博塔羅畫面拿掉。
//   保留下來的規矩：78 張正逆位牌義庫餵給模型防止瞎編、一題一陣（紫薇看題目挑牌陣）、桌面現況每輪重貼、[drew a card] 之後一律砍掉。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    // =================================================================
    // 2. 塔羅數據庫
    // =================================================================
    // 牌圖：1909 萊德偉特（公版，Wikimedia Commons 取的 300 寬）放在 sound-files 鎖 commit。
    //   11-26 原本外連 sacred-texts 被擋（403）整副破圖，改成自己放；要換圖就傳新資料夾、改這行
    const BASE_URL = "https://raw.githubusercontent.com/nancywang3641/sound-files/9c871ca68f88687dbaebf0c21e852418f57e417a/tarot_rws_v1";
    
    // 大阿爾克那映射
    const MAJOR_ARCANA = [
        { id: 'ar00', name: '0. The Fool (愚者)' }, { id: 'ar01', name: 'I. The Magician (魔術師)' },
        { id: 'ar02', name: 'II. The High Priestess (女祭司)' }, { id: 'ar03', name: 'III. The Empress (皇后)' },
        { id: 'ar04', name: 'IV. The Emperor (皇帝)' }, { id: 'ar05', name: 'V. The Hierophant (教皇)' },
        { id: 'ar06', name: 'VI. The Lovers (戀人)' }, { id: 'ar07', name: 'VII. The Chariot (戰車)' },
        { id: 'ar08', name: 'VIII. Strength (力量)' }, { id: 'ar09', name: 'IX. The Hermit (隱士)' },
        { id: 'ar10', name: 'X. Wheel of Fortune (命運之輪)' }, { id: 'ar11', name: 'XI. Justice (正義)' },
        { id: 'ar12', name: 'XII. The Hanged Man (倒吊人)' }, { id: 'ar13', name: 'XIII. Death (死神)' },
        { id: 'ar14', name: 'XIV. Temperance (節制)' }, { id: 'ar15', name: 'XV. The Devil (惡魔)' },
        { id: 'ar16', name: 'XVI. The Tower (高塔)' }, { id: 'ar17', name: 'XVII. The Star (星星)' },
        { id: 'ar18', name: 'XVIII. The Moon (月亮)' }, { id: 'ar19', name: 'XIX. The Sun (太陽)' },
        { id: 'ar20', name: 'XX. Judgement (審判)' }, { id: 'ar21', name: 'XXI. The World (世界)' }
    ];

    // 小阿爾克那映射
    let FULL_DECK_DEF = [...MAJOR_ARCANA];
    const SUITS = [
        { code: 'wa', name: 'Wands (權杖)' }, { code: 'cu', name: 'Cups (聖杯)' },
        { code: 'sw', name: 'Swords (寶劍)' }, { code: 'pe', name: 'Pentacles (星幣)' }
    ];
    
    SUITS.forEach(suit => {
        for (let i = 1; i <= 14; i++) {
            let cardName = `${i} of ${suit.name}`;
            let fileName = suit.code;
            
            // 處理數字編號
            if (i < 10) fileName += `0${i}`; else fileName += `${i}`;

            // ⚠️ Ace 與宮廷牌修正
            if (i === 1) { 
                cardName = `Ace of ${suit.name}`; 
                fileName = `${suit.code}ac`; 
            }
            if (i === 11) { cardName = `Page of ${suit.name}`; fileName = `${suit.code}pa`; }
            if (i === 12) { cardName = `Knight of ${suit.name}`; fileName = `${suit.code}kn`; }
            if (i === 13) { cardName = `Queen of ${suit.name}`; fileName = `${suit.code}qu`; }
            if (i === 14) { cardName = `King of ${suit.name}`; fileName = `${suit.code}ki`; }
            
            FULL_DECK_DEF.push({ id: fileName, name: cardName });
        }
    });

    // 78張牌的正逆位牌義（餵給AI當解讀依據，防止胡編）
    const TAROT_MEANINGS = {
        ar00: { up: '新的開始、冒險、自由、天真的勇氣', rev: '魯莽、逃避現實、不計後果、遲遲不敢踏出第一步' },
        ar01: { up: '創造力、行動力、資源到位、心想事成', rev: '空談、欺瞞、才能被浪費、準備不足' },
        ar02: { up: '直覺、潛意識、靜觀其變、隱藏的真相', rev: '忽視直覺、秘密洩露、只看表面、沉不住氣' },
        ar03: { up: '豐盛、滋養、感性、成果正在孕育', rev: '依賴、過度保護、享樂過頭、創造力停滯' },
        ar04: { up: '權威、秩序、掌控、事業穩固', rev: '專橫、僵化、控制欲、權威失效' },
        ar05: { up: '傳統、指導、規範、可信賴的建議', rev: '教條、盲從、被規則束縛、需要打破常規' },
        ar06: { up: '愛情、結合、價值觀契合、重要抉擇', rev: '關係失衡、誘惑、三心二意、錯誤的選擇' },
        ar07: { up: '意志力、勝利、掌控方向、勇往直前', rev: '失控、方向迷失、內外拉扯、急躁冒進' },
        ar08: { up: '柔性的力量、勇氣、耐心、馴服慾望', rev: '自我懷疑、意志薄弱、硬碰硬、情緒失控' },
        ar09: { up: '內省、獨處、尋求真理、智者的指引', rev: '孤立、自我封閉、鑽牛角尖、逃避人群' },
        ar10: { up: '轉機、命運的節點、好運降臨、順勢而為', rev: '時運不濟、循環的困境、抗拒改變' },
        ar11: { up: '公平、因果、權衡、法律或契約順利', rev: '不公、失衡、逃避責任、偏頗的判斷' },
        ar12: { up: '換位思考、主動暫停、以犧牲換取領悟', rev: '無謂的犧牲、僵局、拖延、視角固化' },
        ar13: { up: '結束與重生、斷捨離、舊階段落幕', rev: '抗拒結束、拖著爛攤子、恐懼改變' },
        ar14: { up: '平衡、調和、節制、耐心整合', rev: '失衡、走極端、揮霍、欲速則不達' },
        ar15: { up: '慾望、束縛、成癮、物質誘惑', rev: '掙脫枷鎖、覺醒、戒斷、擺脫依賴' },
        ar16: { up: '驟變、崩塌、真相炸裂、推倒重來', rev: '勉強撐著的危樓、延遲的崩壞、僥倖逃過一劫' },
        ar17: { up: '希望、療癒、靈感、值得等待的願景', rev: '失望、信心動搖、好高騖遠' },
        ar18: { up: '不安、迷霧、潛藏的恐懼、真相未明', rev: '迷霧散去、恐懼消退、真相浮現' },
        ar19: { up: '成功、活力、坦率、光明正大的喜悅', rev: '延遲的成功、盲目樂觀、光環褪色' },
        ar20: { up: '覺醒、命運的召喚、重獲新生、蓋棺定論', rev: '過度自我批判、錯過召喚、無法釋懷過去' },
        ar21: { up: '圓滿、完成、整合、抵達終點', rev: '差一步的完成、留有缺憾、停在終點前' },
        waac: { up: '新機會、熱情點燃、行動的火種', rev: '熱情熄滅、虛假的機會、動力不足' },
        wa02: { up: '規劃未來、掌握主動、選定方向', rev: '害怕未知、計畫停在紙上、選擇困難' },
        wa03: { up: '初見成果、遠見、等待船入港', rev: '計畫受阻、目光短淺、成果延遲' },
        wa04: { up: '慶祝、階段性的穩定成果、歸屬感', rev: '基礎不穩、慶祝言之過早、家內失和' },
        wa05: { up: '競爭、摩擦、良性的衝突', rev: '惡性內耗、一味避戰、衝突升級' },
        wa06: { up: '勝利、被認可、凱旋歸來', rev: '虛名、成果被質疑、驕兵必敗' },
        wa07: { up: '堅守立場、以一擋百、防禦成功', rev: '寡不敵眾、疲於應付、快守不住了' },
        wa08: { up: '迅速進展、消息傳來、事態加速', rev: '延誤、節奏混亂、操之過急' },
        wa09: { up: '堅持到底、帶傷防備、最後一哩路', rev: '精疲力竭、偏執的防備、瀕臨放棄' },
        wa10: { up: '重擔、責任壓身、負重前行', rev: '該卸下重擔、學會放手，否則會被壓垮' },
        wapa: { up: '熱情的新消息、探索、躍躍欲試', rev: '三分鐘熱度、壞消息、幼稚衝動' },
        wakn: { up: '衝勁、冒險、大膽行動', rev: '魯莽、半途而廢、火氣上頭' },
        waqu: { up: '自信、魅力、熱情的感染力', rev: '善妒、跋扈、外強中乾' },
        waki: { up: '領導力、有遠見的開創者、魄力', rev: '獨斷、暴躁、承諾跳票' },
        cuac: { up: '新感情、情感豐沛、心靈滿溢', rev: '情感空虛、錯過的感情、壓抑情緒' },
        cu02: { up: '兩情相悅、夥伴契合、和解', rev: '關係失衡、貌合神離、溝通破裂' },
        cu03: { up: '友誼、慶祝、團體的支持', rev: '第三者、社交倦怠、小圈子是非' },
        cu04: { up: '倦怠、無視眼前的機會、需要重新聚焦', rev: '走出低潮、接住新機會、重燃興趣' },
        cu05: { up: '失落、悔恨、眼裡只有失去的', rev: '走出悲傷、接受現實、回頭看見還剩下的' },
        cu06: { up: '懷舊、舊識重逢、純真的善意', rev: '困在過去、舊事重演、該向前看了' },
        cu07: { up: '選項太多、幻想、霧裡看花', rev: '幻象破滅、下定決心、看清現實' },
        cu08: { up: '離開已無意義的事物、去追尋更深的東西', rev: '不敢離開、反覆糾結、假裝灑脫' },
        cu09: { up: '願望成真、滿足、犒賞自己', rev: '貪心不足、表面的滿足、願望變了質' },
        cu10: { up: '圓滿的關係、家庭和樂、情感的歸宿', rev: '家庭失和、表面幸福、理想與現實的落差' },
        cupa: { up: '感性的訊息、創意萌芽、心意傳達', rev: '情緒化、不切實際、曖昧不明的訊號' },
        cukn: { up: '浪漫的追求、心意的邀請、白馬騎士', rev: '花言巧語、情感操縱、承諾不可信' },
        cuqu: { up: '共情、溫柔、直覺敏銳的照顧者', rev: '情緒勒索、多愁善感、界線模糊' },
        cuki: { up: '情緒成熟、包容、以柔御剛', rev: '情緒壓抑、喜怒無常、拿感情當武器' },
        swac: { up: '清晰的判斷、真相、突破性的想法', rev: '思緒混亂、誤判、真相被掩蓋' },
        sw02: { up: '僵持、逃避抉擇、蒙著眼的平衡', rev: '僵局鬆動、被迫面對、底牌掀開' },
        sw03: { up: '心碎、背叛、痛苦的真相', rev: '正在療傷、逐漸釋懷、傷口未癒先別掀' },
        sw04: { up: '休息、暫停、養精蓄銳', rev: '被迫停擺、倦怠爆發、該醒來行動了' },
        sw05: { up: '慘勝、衝突留下裂痕、贏了面子輸了裡子', rev: '冤冤相報、該放下爭端、認賠止損' },
        sw06: { up: '過渡、駛離風暴、漸入平靜', rev: '走不出去、舊問題跟著上船、行程受阻' },
        sw07: { up: '策略、迂迴、隱瞞或取巧', rev: '謊言敗露、自欺欺人、良心發現' },
        sw08: { up: '自我設限、感覺被困、其實出口就在旁邊', rev: '掙脫束縛、看見出口、重獲自由' },
        sw09: { up: '焦慮、失眠、被恐懼放大的陰影', rev: '焦慮緩解、噩夢結束、走出黑暗' },
        sw10: { up: '谷底、結束的劇痛、背後插刀', rev: '觸底反彈、劫後餘生、小心舊傷復發' },
        swpa: { up: '好奇、觀察、蒐集情報', rev: '八卦、窺探、輕率的言論' },
        swkn: { up: '果斷出擊、直言、雷厲風行', rev: '咄咄逼人、莽撞、言語傷人' },
        swqu: { up: '清醒、獨立、一針見血', rev: '刻薄、冷酷、被偏見蒙蔽' },
        swki: { up: '理性的權威、專業判斷、講原則', rev: '濫用權力、冷血、強詞奪理' },
        peac: { up: '新的財源、實際的機會、種子落地', rev: '錯失機會、財務不穩、計畫缺乏根基' },
        pe02: { up: '多工平衡、靈活調度、收支週轉', rev: '顧此失彼、失衡、被瑣事淹沒' },
        pe03: { up: '團隊合作、技能被認可、扎實累積', rev: '單打獨鬥、敷衍了事、合作不順' },
        pe04: { up: '守成、握緊資源、穩固但保守', rev: '吝嗇、抓得太緊，或反過來散財失控' },
        pe05: { up: '匱乏、困頓、被關在門外', rev: '谷底回升、獲得援助、擺脫窮酸心態' },
        pe06: { up: '施與受、資源流動、貴人相助', rev: '不對等的給予、附帶條件的幫助、欠人情債' },
        pe07: { up: '耐心等待收成、盤點、長線投資', rev: '白費工夫、不耐煩、報酬不如預期' },
        pe08: { up: '勤勉、打磨技藝、專注細節', rev: '敷衍、重複勞動的倦怠、半吊子' },
        pe09: { up: '獨立自足、優雅的成果、享受果實', rev: '過勞、虛有其表、靠別人供養' },
        pe10: { up: '家業、長期的富足、傳承', rev: '家產糾紛、財務不穩、短視近利' },
        pepa: { up: '務實的學習、新的實務機會、腳踏實地', rev: '拖延、心不在焉、計畫落不了地' },
        pekn: { up: '穩紮穩打、可靠、按部就班', rev: '停滯、一成不變、過度保守' },
        pequ: { up: '務實的照顧、理財有道、安穩', rev: '患得患失、工作與生活失衡、物質焦慮' },
        peki: { up: '事業有成、財務穩健、可靠的靠山', rev: '貪婪、固執、用金錢衡量一切' }
    };

    function cardBrief(card) {
        const m = TAROT_MEANINGS[card.id];
        if (!m) return '';
        return `｜牌義參考: ${card.isReversed ? m.rev : m.up}`;
    }

    // =================================================================
    // 2.5 牌陣：一個問題攤幾張、每張放什麼位置，由紫薇看題目決定
    //   以前不管問什麼都是「過去/現在/未來」三張，問「他怎麼想我」也硬套時間線。
    //   塔羅本來就是一題一陣、陣型看問題：快答一張、看走向三張、感情六張。
    // =================================================================
    const SPREADS = {
        one:      { count: 1, name: '單張直覺',   positions: ['答案'],
                    use: '是非題、今天運氣、只要一個方向的簡單問題' },
        time:     { count: 3, name: '時間之流',   positions: ['根源', '現況', '走向'],
                    use: '某件事會怎麼發展、會不會發生、為什麼變成這樣' },
        action:   { count: 3, name: '處境與行動', positions: ['處境', '該做的', '結果'],
                    use: '該不該做某件事、要不要開口、怎麼辦' },
        choice:   { count: 3, name: '兩條路',     positions: ['選前者', '選後者', '提醒'],
                    use: '兩個選項二選一、A還是B' },
        relation: { count: 6, name: '關係全貌',   positions: ['你的立場', '對方的立場', '你的心裡', '對方的心裡', '卡在哪', '走向'],
                    use: '感情、人際、對方怎麼想、我們之間會怎樣' }
    };
    const DEFAULT_SPREAD = 'time';

    function spreadMenuText() {
        return Object.entries(SPREADS).map(([id, s]) =>
            `${id}：${s.name}（${s.count}張：${s.positions.join('／')}）— 適合${s.use}`).join('\n');
    }

    // 模型回的第一行要是 SPREAD=<id>，後面可以跟一句紫薇口吻的話。認不出來就回預設。
    function parseSpreadReply(text) {
        const m = String(text || '').match(/SPREAD\s*=\s*([a-z]+)/i);
        const hit = !!(m && SPREADS[m[1].toLowerCase()]);
        const id = hit ? m[1].toLowerCase() : DEFAULT_SPREAD;
        // 代號都認不出來，後面那句話也不能信（多半是模型在自由發揮），一起丟掉
        const note = hit ? String(text).replace(/SPREAD\s*=\s*[a-z]+/i, '').replace(/^[\s:：\-—]+/, '').trim().split('\n')[0].slice(0, 40) : '';
        return { id, note };
    }

    async function chooseSpread(question) {
        const messages = [{
            role: 'system',
            content: `你是占卜師紫薇。客人剛講了問題，你要決定攤哪個牌陣。可用的牌陣：\n${spreadMenuText()}\n\n` +
                     `規則：問題明確講了想抽幾張或想用哪種陣，照客人的意思。感情和人際用 relation；二選一用 choice；` +
                     `問該不該、怎麼辦用 action；問會怎樣、會不會用 time；一句話能答完的用 one。\n` +
                     `只輸出兩行：第一行寫 SPREAD=牌陣代號；第二行用紫薇的口吻講一句話告訴客人攤幾張、為什麼，十五字以內，不加標點修飾。`
        }, { role: 'user', content: `客人的問題：${question}` }];
        const config = win.OS_SETTINGS ? win.OS_SETTINGS.getConfig() : {};
        let out = '';
        try {
            await Promise.race([
                new Promise((resolve, reject) => {
                    win.OS_API.chat(messages, config, (chunk) => {
                        if (typeof chunk === 'string' && chunk.length >= out.length && out.length > 0 && chunk.startsWith(out)) out = chunk;
                        else out += String(chunk);
                    }, (final) => { out = final || out; resolve(); }, reject, { task: 'tarot' });
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
            ]);
        } catch (e) {
            console.warn('[Tarot] 選牌陣失敗，退回預設三張:', e && e.message);
            return { id: DEFAULT_SPREAD, note: '' };
        }
        return parseSpreadReply(out);
    }

    // =================================================================
    // 3. 占卜引擎（11-26 起只剩這一層：畫面搬進紫薇的記憶吧檯，core/void/lobby_memory.js 的「問問自己的事」）
    //   11-26：個人占卜和記憶占卜放在一起，個人占卜的舊 UI 刪除（已經換成新的吧檯）
    //   舊的賽博塔羅畫面（launch／選牌槽／聊天面板）整個拿掉；牌、牌陣、牌義、解牌和追問的規矩照舊，一個字沒改。
    //   用法：s = session(問題, 牌陣) → read(s, 抽到的牌, 邊寫邊回呼) → ask(s, 追問) ／ 回覆說要補抽 → addCard(s, 一張)
    //   每次 read／ask／addCard 回 { text, more }：more＝紫薇提議補抽一張（[drew a card] 後面的字一律砍掉，不讓模型自己生牌）
    // =================================================================
    const imgOf = (card) => `${BASE_URL}/${card.id}.jpg`;

    // 牌名給畫面用：大牌取括號裡的中文，小牌＝花色＋點數（權杖三、聖杯王牌、寶劍騎士）
    const RANK_ZH = ['', '王牌', '二', '三', '四', '五', '六', '七', '八', '九', '十', '侍從', '騎士', '皇后', '國王'];
    const SUIT_ZH = { wa: '權杖', cu: '聖杯', sw: '寶劍', pe: '星幣' };
    const RANK_OF = { ac: 1, pa: 11, kn: 12, qu: 13, ki: 14 };
    function zhName(card) {
        if (/^ar\d\d$/.test(card.id)) { const m = String(card.name).match(/[（(]([^）)]+)[）)]/); return m ? m[1] : card.name; }
        const suit = SUIT_ZH[card.id.slice(0, 2)] || '';
        const r = card.id.slice(2);
        return suit + (RANK_ZH[RANK_OF[r] || parseInt(r, 10)] || '');
    }

    // 洗一副新牌（每張各自隨機正逆位）
    function newDeck() {
        const d = [...FULL_DECK_DEF];
        for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
        return d.map(c => ({ ...c, isReversed: Math.random() < 0.5 }));
    }

    // 紫薇看題目挑牌陣：回 { id, note, spread: { id, count, name, positions } }，沒等到就三張時間之流
    async function pickSpread(question) {
        const p = await chooseSpread(question);
        const def = SPREADS[p.id] || SPREADS[DEFAULT_SPREAD];
        return { id: p.id, note: p.note, spread: { id: p.id, count: def.count, name: def.name, positions: def.positions.slice() } };
    }

    function getCurrentTime() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
        const h = now.getHours();
        const timeOfDay = (h >= 5 && h < 12) ? '上午' : (h >= 12 && h < 18) ? '下午' : (h >= 18 && h < 22) ? '晚上' : '深夜';
        return { formatted: `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 星期${weekday} ${timeOfDay} ${pad(h)}:${pad(now.getMinutes())}` };
    }

    function session(question, spread) {
        return { question: String(question || ''), spread: spread || null, history: [], table: [], busy: false };
    }

    // 🚨 桌面現況：每一輪追問都重貼一次。
    //    只把「不准自己生牌」寫在最初的系統提示裡壓不住——聊個兩三輪模型就會自己抽一張出來講
    //    (2026-08-23 回報)。狀態要放在最靠近生成的位置才有效。
    function tableStateNote(s) {
        const pos = (s.spread && s.spread.positions) || [];
        const list = (s.table || []).map((c, i) =>
            `${i + 1}.${pos[i] ? '【' + pos[i] + '】' : '【補抽】'}${c.name} [${c.isReversed ? '逆位' : '正位'}]`).join('；');
        return `【桌面現況】現在攤開的牌只有：${list || '（還沒有任何牌）'}。\n` +
               `你沒有抽新牌，也不知道牌堆裡任何一張沒攤開的牌是什麼。\n` +
               `要補抽就只講一句提議，然後在訊息最後放 [drew a card] 就停住——` +
               `絕對不要自己講出任何沒攤開的牌名、正逆位或牌義。`;
    }

    // 叫模型（主模型、task tarot），邊寫邊把目前的字交給 onText
    function _stream(messages, onText) {
        return new Promise((resolve, reject) => {
            let full = '';
            const config = win.OS_SETTINGS ? win.OS_SETTINGS.getConfig() : {};
            win.OS_API.chat(messages, config, (chunk) => {
                if (typeof chunk === 'string' && chunk.length >= full.length && full.length > 0 && chunk.startsWith(full)) full = chunk;
                else full += String(chunk);
                try { onText && onText(full.split('[drew a card]')[0]); } catch (e) {}
            }, (final) => resolve(final || full), reject, { task: 'tarot' });
        });
    }
    async function _reply(s, messages, onText) {
        const raw = await _stream(messages, onText);
        const more = String(raw).includes('[drew a card]');
        // 🚨 標記之後的內容一律砍掉：牌還沒抽，模型在標記後面接著寫的一定是幻覺出來的牌。用程式強制「停在標記」，不靠模型自律。
        const text = String(raw).split('[drew a card]')[0].trim();
        s.history.push({ role: 'assistant', content: text });
        return { text, more };
    }

    // 初次解讀（整個牌陣）
    async function read(s, cards, onText) {
        s.table = cards.slice();
        const sp = s.spread || { count: 3, name: SPREADS.time.name, positions: SPREADS.time.positions };
        const cardInfo = `\n牌陣數據（${sp.name}，共${sp.count}張）:\n` + cards.map((c, i) =>
            `${i + 1}. 【${sp.positions[i] || ''}】${c.name} [${c.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]${cardBrief(c)}`).join('\n');
        const readingHint = sp.count === 1
            ? '只有一張牌，直接回答問題，不要硬拆成前因後果。'
            : `按每張牌的【位置】去讀，位置之間串成一件事講，不要一張一段分開講。`;
        let systemPrompt = "你現在是 Pythia，一位神秘、溫柔且富有洞察力的塔羅占卜師(姊姊)。";
        if (win.OS_PROMPTS) {
            const customPrompt = win.OS_PROMPTS.get('tarot_pythia');
            if (customPrompt && customPrompt.trim().length > 0) systemPrompt = customPrompt;
        }
        s.history.push({
            role: 'system',
            content: `${systemPrompt}

【當前時間】${getCurrentTime().formatted}

請根據以下牌陣為用戶解讀：${cardInfo}
用戶的問題是: "${s.question}"。
${readingHint}牌義參考只是你的內部依據，禁止照抄條列，必須揉進用戶的具體問題。語氣要自然，像在對話，不要像寫論文。`
        });
        return _reply(s, s.history, onText);
    }

    // 追問：提醒只加在這一輪送出的訊息裡、不寫進 history（不然每輪都疊一條，聊久了整串都是提醒）
    async function ask(s, text, onText) {
        s.history.push({ role: 'user', content: `【當前時間】${getCurrentTime().formatted}\n\n${text}` });
        return _reply(s, s.history.concat([{ role: 'system', content: tableStateNote(s) }]), onText);
    }

    // 補抽一張：補抽是「加一張」不是「重開」，原本的牌陣留著給桌面現況用
    async function addCard(s, card, onText) {
        s.table = (s.table || []).concat([card]);
        const cardInfo = `單卡: ${card.name} [${card.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]${cardBrief(card)}`;
        // ⚠️ 這裡以前會把整份人設(含破甲前言)重貼一次 → 每抽一張就多幾千字，而且會出現好幾條互相打架的 system 訊息。人設在歷史開頭就有了，這裡只補當下的狀態。
        s.history.push({
            role: 'system',
            content: `【當前時間】${getCurrentTime().formatted}

用戶剛剛親手抽出了這張補充牌。請根據它做簡短的單卡解讀（約50-100字），語氣自然，像在對話。
只能解讀這一張，不要再提到任何沒攤開的牌。`
        });
        s.history.push({ role: 'user', content: `請解讀這張牌：${cardInfo}` });
        return _reply(s, s.history, onText);
    }

    win.OS_TAROT = { SPREADS, newDeck, imgOf, zhName, pickSpread, session, read, ask, addCard };
    try { if (win !== window) window.OS_TAROT = win.OS_TAROT; } catch (e) {}

})();
